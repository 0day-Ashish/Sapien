#!/usr/bin/env bash
# Engine continuous deployment, pull-based (runs on the VM every minute via sapien-autodeploy.timer).
#
# 1. Fetch origin/main. Nothing new: exit.
# 2. CI gate: the commit's `engine` and `contracts` check runs must have finished green. Still running: retry next
#    tick. Failed: skip that commit (logged once) and keep the running engine.
# 3. Move the checkout to it. If engine/ or contracts/deployments/ changed: npm ci (lockfile changed only), restart
#    sapien-engine, health-check its HTTP. Unhealthy after 90s: roll back to the previous commit and restart.
#
# .env.local, .data/ and .state/ are gitignored, so moving the checkout never touches keys or engine state.
# Logs: journalctl -u sapien-autodeploy
set -euo pipefail

# Run from a copy: the git reset below rewrites this file.
if [ -z "${AUTODEPLOY_COPY:-}" ]; then
  copy=$(mktemp /tmp/sapien-autodeploy.XXXXXX)
  cp "$0" "$copy"
  AUTODEPLOY_COPY="$copy" exec bash "$copy" "$@"
fi
trap 'rm -f "$AUTODEPLOY_COPY"' EXIT

REPO_DIR="${REPO_DIR:-/home/ubuntu/sapien}"
REPO_SLUG="${REPO_SLUG:-SachPlayZ/Sapien}"
SERVICE="${SERVICE:-sapien-engine}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/leaderboard}"
REQUIRED_CHECKS=(engine contracts)
SKIP_FILE="$REPO_DIR/.autodeploy-skipped"

exec 9>/tmp/sapien-autodeploy.lock
flock -n 9 || exit 0 # a deploy is already running

cd "$REPO_DIR"
git fetch -q origin main
current=$(git rev-parse HEAD)
target=$(git rev-parse origin/main)
[ "$current" = "$target" ] && exit 0
[ -f "$SKIP_FILE" ] && [ "$(cat "$SKIP_FILE")" = "$target" ] && exit 0

# --- CI gate --------------------------------------------------------------------------------------------------------
runs=$(curl -fsSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO_SLUG/commits/$target/check-runs?per_page=100") || {
  echo "GitHub API unreachable; retrying next tick"
  exit 0
}
if ! jq -e '.check_runs | type == "array"' >/dev/null <<<"$runs"; then
  echo "Unexpected GitHub API response ($(jq -r '.message // "no message"' <<<"$runs" 2>/dev/null)); retrying next tick"
  exit 0
fi
for check in "${REQUIRED_CHECKS[@]}"; do
  # Latest run of that job for this commit (a re-run supersedes the earlier one).
  run=$(jq -c --arg n "$check" '[.check_runs[] | select(.name == $n)] | sort_by(.started_at) | last // empty' <<<"$runs")
  if [ -z "$run" ]; then
    echo "${target:0:7}: no '$check' check yet; waiting"
    exit 0
  fi
  status=$(jq -r .status <<<"$run")
  conclusion=$(jq -r .conclusion <<<"$run")
  if [ "$status" != "completed" ]; then
    echo "${target:0:7}: '$check' is $status; waiting"
    exit 0
  fi
  if [ "$conclusion" != "success" ]; then
    echo "${target:0:7}: '$check' finished $conclusion; not deploying this commit"
    echo "$target" >"$SKIP_FILE"
    exit 0
  fi
done

# --- Deploy ---------------------------------------------------------------------------------------------------------
changed=$(git diff --name-only "$current" "$target")
git reset -q --hard "$target"
echo "Checkout ${current:0:7} -> ${target:0:7} ($(git log -1 --format=%s))"

if ! grep -qE '^(engine/|contracts/deployments/)' <<<"$changed"; then
  echo "No engine changes; engine keeps running"
  exit 0
fi

install_deps() {
  if grep -qE '^engine/package(-lock)?\.json$' <<<"$1"; then
    (cd engine && npm ci --no-audit --no-fund --loglevel=error)
  fi
}

healthy() {
  for _ in $(seq 1 18); do
    sleep 5
    systemctl is-active -q "$SERVICE" && curl -fsS -o /dev/null "$HEALTH_URL" && return 0
  done
  return 1
}

install_deps "$changed"
sudo systemctl restart "$SERVICE"
if healthy; then
  echo "Deployed ${target:0:7}: $SERVICE healthy"
  exit 0
fi

echo "${target:0:7}: $SERVICE unhealthy after restart; rolling back to ${current:0:7}"
journalctl -u "$SERVICE" -n 20 --no-pager || true
git reset -q --hard "$current"
install_deps "$changed"
sudo systemctl restart "$SERVICE"
echo "$target" >"$SKIP_FILE"
if healthy; then echo "Rolled back to ${current:0:7}: healthy"; else echo "Rollback to ${current:0:7} is unhealthy too"; fi
exit 1
