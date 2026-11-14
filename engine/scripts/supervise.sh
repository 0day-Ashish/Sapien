#!/usr/bin/env bash
# Keeps the engine running (#23): restarts it after a crash, with a short backoff. Logs to engine/.data/engine.log.
#   nohup scripts/supervise.sh >/dev/null 2>&1 &
cd "$(dirname "$0")/.." || exit 1
mkdir -p .data
while true; do
  echo "$(date -u +%FT%TZ) starting engine" >> .data/engine.log
  npx tsx scripts/run-engine.ts >> .data/engine.log 2>&1
  echo "$(date -u +%FT%TZ) engine exited ($?), restarting in 15s" >> .data/engine.log
  sleep 15
done
