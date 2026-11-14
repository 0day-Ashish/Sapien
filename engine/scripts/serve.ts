// Runs the engine's HTTP surface for the UI.
//   npm run serve            (ENGINE_PORT default 8787, ENGINE_ALLOW_ORIGIN default *)
// Keys go to engine/.data/agent-wallets.json (gitignored, 0600).
import { AgentWalletStore, startHttp } from "../src/index.js";

const store = new AgentWalletStore(new URL("../.data/agent-wallets.json", import.meta.url).pathname);
const server = await startHttp({
  port: Number(process.env.ENGINE_PORT ?? 8787),
  host: process.env.ENGINE_HOST ?? "127.0.0.1",
  agentWallets: store,
  ...(process.env.ENGINE_ALLOW_ORIGIN ? { allowOrigin: process.env.ENGINE_ALLOW_ORIGIN } : {}),
});
console.log(`Engine HTTP on ${server.url}  (POST /agent-wallets)`);
