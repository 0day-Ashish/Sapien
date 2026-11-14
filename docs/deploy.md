# Deployment (testnet)

| Part | Where | URL |
|---|---|---|
| Frontend | Vercel project `sapien` | https://sapien-omega.vercel.app |
| Engine (agents, runner, HTTP) | Oracle VM, systemd `sapien-engine`, nginx + Let's Encrypt | https://sapien.152-67-0-76.sslip.io |
| Deposit forwarder | Oracle VM, systemd `sapien-deposits` | (no HTTP) |

## Engine: continuous deployment

The VM deploys itself. No GitHub secrets, no inbound access. `sapien-autodeploy.timer` runs `engine/deploy/autodeploy.sh` every minute:

1. Fetch `origin/main`. If nothing is new, exit.
2. **CI gate**: the new commit's `engine` and `contracts` CI jobs must have passed. While they're still running, it waits. If they fail, that commit is never deployed.
3. Move the VM checkout to the commit. Only if `engine/` or `contracts/deployments/` changed: run `npm ci` (if the lockfile changed), restart `sapien-engine` and `sapien-deposits`, then health-check `GET /leaderboard`.
4. **Rollback**: if the engine is unhealthy after 90s, it returns to the previous commit and restarts.

Merge to `main` and the engine is live about a minute after CI turns green.

Keys and state stay put across deploys. `engine/.env.local`, `engine/.data/` and `engine/.state/` are gitignored and exist only on the VM. Only one engine may run with the operator key, so don't run `npm run engine` locally while the VM runs it.

### Operating it

```bash
ssh ubuntu@152.67.0.76
journalctl -u sapien-autodeploy -f     # deploys
journalctl -u sapien-engine -f         # the engine
journalctl -u sapien-deposits -f       # deposit forwarding
sudo systemctl restart sapien-engine   # manual restart
systemctl list-timers sapien-autodeploy.timer
```

Unit files live in `engine/deploy/`. After changing them, copy them to `/etc/systemd/system/` and run `sudo systemctl daemon-reload`.

## Frontend

Production env vars (contract addresses, `NEXT_PUBLIC_ENGINE_URL`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `FRED_API_KEY`, `DATABASE_URL`) are set in the Vercel project. `DATABASE_URL` is the Neon Postgres connection string for Mandate chat history; without it the chat keeps history in the browser only. The engine only accepts browser requests from `ENGINE_ALLOW_ORIGIN` in the VM's `engine/.env.local`. If the Vercel domain changes, update it there and restart the engine.

## Testnet deposits need a float

Base Sepolia USDC never reaches HyperCore: the mock CCTP forwarder pays each Vault out of the Deposit Account's HyperCore spot float (`0x32c0…8036`). Every deposit drains the float one for one. If it's too low, the forwarder retries the deposit every 5s until the float is topped up with HL testnet USDC. Solana devnet deposits use real CCTP and don't need it.
