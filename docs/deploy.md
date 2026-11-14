# Deployment (testnet)

| Part | Where | URL |
|---|---|---|
| Frontend | Vercel project `sapien` | https://sapien-omega.vercel.app |
| Engine (agents, runner, HTTP) | Oracle VM, systemd `sapien-engine`, nginx + Let's Encrypt | https://sapien.152-67-0-76.sslip.io |

## Engine: continuous deployment

The VM deploys itself. No GitHub secrets, no inbound access. `sapien-autodeploy.timer` runs `engine/deploy/autodeploy.sh` every minute:

1. Fetch `origin/main`. If nothing is new, exit.
2. **CI gate**: the new commit's `engine` and `contracts` CI jobs must have passed. While they're still running, it waits. If they fail, that commit is never deployed.
3. Move the VM checkout to the commit. Only if `engine/` or `contracts/deployments/` changed: run `npm ci` (if the lockfile changed), restart `sapien-engine`, then health-check `GET /leaderboard`.
4. **Rollback**: if the engine is unhealthy after 90s, it returns to the previous commit and restarts.

Merge to `main` and the engine is live about a minute after CI turns green.

Keys and state stay put across deploys. `engine/.env.local`, `engine/.data/` and `engine/.state/` are gitignored and exist only on the VM. Only one engine may run with the operator key, so don't run `npm run engine` locally while the VM runs it.

### Operating it

```bash
ssh ubuntu@152.67.0.76
journalctl -u sapien-autodeploy -f     # deploys
journalctl -u sapien-engine -f         # the engine
sudo systemctl restart sapien-engine   # manual restart
systemctl list-timers sapien-autodeploy.timer
```

Unit files live in `engine/deploy/`. After changing them, copy them to `/etc/systemd/system/` and run `sudo systemctl daemon-reload`.

## Frontend

Production env vars (contract addresses, `NEXT_PUBLIC_ENGINE_URL`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `FRED_API_KEY`) are set in the Vercel project. The engine only accepts browser requests from `ENGINE_ALLOW_ORIGIN` in the VM's `engine/.env.local`. If the Vercel domain changes, update it there and restart the engine.
