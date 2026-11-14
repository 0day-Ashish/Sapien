// Runs the engine's HTTP surface for the UI.
//   npm run serve            (ENGINE_PORT default 8787, ENGINE_ALLOW_ORIGIN default *)
// Keys go to engine/.data/agent-wallets.json (gitignored, 0600).
// With ENGINE_OPERATOR_PRIVATE_KEY and NEAR_ENGINE_PRIVATE_KEY set (engine/.env.local) it also serves the NEAR
// routes: POST /near/vaults, GET /near/vaults/:account, POST /near/mandate.
import { existsSync } from "node:fs";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AgentWalletStore, startHttp } from "../src/index.js";
import { liveNear } from "../src/near/live.js";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);

const store = new AgentWalletStore(`${root}.data/agent-wallets.json`);
const nearOn = !!process.env.ENGINE_OPERATOR_PRIVATE_KEY && !!process.env.NEAR_ENGINE_PRIVATE_KEY;
if (!nearOn) console.warn("ENGINE_OPERATOR_PRIVATE_KEY / NEAR_ENGINE_PRIVATE_KEY not set: NEAR routes are off");

const server = await startHttp({
  port: Number(process.env.ENGINE_PORT ?? 8787),
  host: process.env.ENGINE_HOST ?? "127.0.0.1",
  agentWallets: store,
  ...(nearOn ? { nearVaults: liveNear(root, store, privateKeyToAccount(process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex)).service } : {}),
  ...(process.env.ENGINE_ALLOW_ORIGIN ? { allowOrigin: process.env.ENGINE_ALLOW_ORIGIN } : {}),
});
console.log(`Engine HTTP on ${server.url}  (POST /agent-wallets${nearOn ? ", /near/vaults, /near/mandate" : ""})`);
