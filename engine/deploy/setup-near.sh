#!/usr/bin/env bash
# One-time NEAR setup on the engine VM (ADR-0007). Run on the VM from ~/sapien:
#   ssh ubuntu@152.67.0.76 'bash ~/sapien/engine/deploy/setup-near.sh' <<< "<NEAR_ENGINE_PRIVATE_KEY>"
# The key (ed25519:…) is the engine's function-call key for sapien-vault.testnet; it is read from stdin, never
# put on the command line. Idempotent: existing values and cursors are kept.
set -euo pipefail
cd "$(dirname "$0")/.."

read -r key
[[ "$key" == ed25519:* ]] || { echo "expected an ed25519:… key on stdin" >&2; exit 1; }

mkdir -p .data
# Deposits 0-1 and withdrawals 0-1 were settled during the 14 Nov testnet run; don't forward them again.
[ -f .data/near-deposits.json ] || echo '{"next":2}' > .data/near-deposits.json
[ -f .data/near-withdrawals.json ] || echo '{"from":2,"moved":{}}' > .data/near-withdrawals.json

touch .env.local
add() { grep -q "^$1=" .env.local || echo "$1=$2" >> .env.local; }
grep -q '^NEAR_ENGINE_PRIVATE_KEY=' .env.local || printf '\n# NEAR (ADR-0007)\n' >> .env.local
add NEAR_NETWORK testnet
add NEAR_CONTRACT sapien-vault.testnet
add NEAR_ENGINE_ACCOUNT engine.sapien-vault.testnet
add NEAR_ENGINE_PRIVATE_KEY "$key"
chmod 600 .env.local

sudo cp deploy/sapien-deposits.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sapien-deposits
sudo systemctl restart sapien-engine sapien-deposits
sleep 20
systemctl is-active sapien-engine sapien-deposits
journalctl -u sapien-deposits -n 5 --no-pager
curl -s -o /dev/null -w 'GET /near/vaults/e2e.sapien-vault.testnet -> %{http_code}\n' http://127.0.0.1:"${ENGINE_PORT:-8787}"/near/vaults/e2e.sapien-vault.testnet || true
