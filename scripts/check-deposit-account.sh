#!/usr/bin/env bash
# Confirms the Deposit Account exists on HyperCore (#3). Expect role "user".
# Usage: scripts/check-deposit-account.sh [testnet|mainnet]  (default testnet)
set -euo pipefail
net=${1:-testnet}
case $net in
  testnet) api=https://api.hyperliquid-testnet.xyz/info ;;
  mainnet) api=https://api.hyperliquid.xyz/info ;;
  *) echo "usage: $0 [testnet|mainnet]" >&2; exit 1 ;;
esac
addr=$(node -p 'require("./engine/config.json").depositAccount.address')
curl -s "$api" -H 'content-type: application/json' \
  -d "{\"type\":\"userRole\",\"user\":\"$addr\"}"; echo
