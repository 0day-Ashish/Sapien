// Runs the engine unattended (#23): the runner loop on testnet plus the HTTP surface for the UI.
//   npm run engine                       (once)
//   scripts/supervise.sh                 (restarts on crash; logs to .data/engine.log)
//
// engine/.env.local (falls back to the smoke:chain deployment from #31):
//   RUNNER_VAULT, RUNNER_ASSET (ETH), RUNNER_AGENT_PRIVATE_KEY, ENGINE_OPERATOR_PRIVATE_KEY,
//   MANDATE_REGISTRY, DECISION_LOG, RUNNER_INTERVAL_MS (300000), TYPESAFE_API_KEY, GEMINI_API_KEY,
//   AGENT_REGISTRY (optional, #12: real Bond Minimum checks; Lead Agents are reported to it)

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HyperEvmChain } from "../src/adapters/hyperevm.js";
import { HyperliquidExchange } from "../src/adapters/hyperliquid.js";
import {
  AgentWalletStore,
  createEngine,
  createRunner,
  FundingArbAgent,
  geminiRationaleWriter,
  jevLeadSelector,
  MeanReversionAgent,
  MomentumAgent,
  type AgentProfile,
  type RunnerRecord,
  startHttp,
} from "../src/index.js";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? (fallback ? process.env[fallback] : undefined);
  if (!v) throw new Error(`Set ${k}${fallback ? ` (or ${fallback})` : ""} in engine/.env.local`);
  return v;
};

const vaultId = env("RUNNER_VAULT", "SMOKE_VAULT");
const asset = process.env.RUNNER_ASSET ?? "ETH";
const agent = privateKeyToAccount(env("RUNNER_AGENT_PRIVATE_KEY", "SMOKE_AGENT_PRIVATE_KEY") as Hex);
const operator = privateKeyToAccount(env("ENGINE_OPERATOR_PRIVATE_KEY", "SMOKE_OWNER_PRIVATE_KEY") as Hex);
const intervalMs = Number(process.env.RUNNER_INTERVAL_MS ?? 300_000);

const exchange = new HyperliquidExchange({ isTestnet: true, agentFor: () => agent });
const chain = new HyperEvmChain({ mandateRegistry: env("MANDATE_REGISTRY", "SMOKE_MANDATE_REGISTRY") as Address, decisionLog: env("DECISION_LOG", "SMOKE_DECISION_LOG") as Address, engine: operator, ...(process.env.AGENT_REGISTRY ? { agentRegistry: process.env.AGENT_REGISTRY as Address } : {}) });
const engine = createEngine({ exchange, chain });

// Placeholder Bonds and track records until the AgentRegistry (#12) supplies real ones.
const roster: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [] },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 600, epochReturns: [] },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, epochReturns: [] },
];

// The decision log: JSONL on disk (track record, replay), the last 500 in memory (feed).
mkdirSync(`${root}.data`, { recursive: true });
const logFile = `${root}.data/decisions.jsonl`;
const recent: RunnerRecord[] = existsSync(logFile)
  ? readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).slice(-500).map((l) => JSON.parse(l) as RunnerRecord)
  : [];
const log = (r: RunnerRecord) => {
  appendFileSync(logFile, `${JSON.stringify(r)}\n`);
  recent.push(r);
  if (recent.length > 500) recent.shift();
  const what = r.error ? `ERROR ${r.error}` : r.result ? `${r.proposal?.agentId} ${r.proposal?.intent} ${r.proposal?.side} → ${r.result.kind}${r.result.kind === "rejected" ? ` (${r.result.rejection.code})` : ""}` : (r.note ?? "no proposal");
  console.log(`${new Date(r.at).toISOString()} ${r.asset} ${r.regime ?? "?"} lead=${r.allocation?.leadAgentId ?? "-"} | ${what}`);
};

const runner = createRunner({
  engine,
  exchange,
  market: {
    snapshot: async (a) => {
      const [candles4h, fundingRateHourly, fundingHistoryHourly, markPrice] = await Promise.all([exchange.candles4h(a), exchange.fundingRateHourly(a), exchange.fundingHistoryHourly(a), exchange.markPrice(a)]);
      return { asset: a, candles4h, fundingRateHourly, fundingHistoryHourly, markPrice };
    },
  },
  vaults: [{ vaultId, asset }],
  roster,
  agents: [new MomentumAgent(), new FundingArbAgent(), new MeanReversionAgent()],
  onVetoWindow: (vault, p) =>
    console.log(`Veto Window open on ${vault}: ${p.agentId} ${p.side} ${p.size} ${p.asset} (${p.notional.toFixed(0)} USDC) until ${new Date(p.expiresAt).toISOString()}`),
  select: process.env.TYPESAFE_API_KEY ? jevLeadSelector() : async () => { throw new Error("TYPESAFE_API_KEY not set"); },
  ...(process.env.GEMINI_API_KEY ? { write: geminiRationaleWriter() } : {}),
  log,
});

const http = await startHttp({
  port: Number(process.env.ENGINE_PORT ?? 8787),
  host: process.env.ENGINE_HOST ?? "127.0.0.1",
  agentWallets: new AgentWalletStore(`${root}.data/agent-wallets.json`),
  feed: () => recent,
  vaultStatus: (id) => engine.vaultStatus(id),
  veto: async (vault, proposalId) => {
    const result = await engine.handle({ type: "veto", vaultId: vault, proposalId });
    if (result.kind === "vetoed") log({ at: Date.now(), vaultId: vault, asset, result, note: "Vetoed by the user" });
    return result;
  },
  ...(process.env.ENGINE_ALLOW_ORIGIN ? { allowOrigin: process.env.ENGINE_ALLOW_ORIGIN } : {}),
});
console.log(`Engine running: Vault ${vaultId} on ${asset}, every ${intervalMs / 1000}s. HTTP ${http.url}`);

// The AgentRegistry sets each agent's Bond Minimum from the Vaults it leads, so report every Lead Agent change.
let reportedLead: string | undefined | null = null;
async function reportLead() {
  const lead = engine.vaultStatus(vaultId).leadAgent?.agentId;
  if (!process.env.AGENT_REGISTRY || lead === reportedLead) return;
  await chain.reportLead(vaultId, lead, await exchange.accountValue(vaultId));
  reportedLead = lead;
}

for (;;) {
  await runner.tick();
  await reportLead().catch((e) => console.error(`AgentRegistry.reportLead: ${(e as Error).message}`));
  await new Promise((r) => setTimeout(r, intervalMs));
}
