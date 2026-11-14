// Runs the engine unattended (#23): the runner loop on testnet plus the HTTP surface for the UI.
//   npm run engine                       (once)
//   scripts/supervise.sh                 (restarts on crash; logs to .data/engine.log)
//   On the VM: systemd sapien-engine, deployed from main after green CI (docs/deploy.md)
//
// engine/.env.local (falls back to the smoke:chain deployment from #31):
//   RUNNER_VAULT, RUNNER_ASSET (ETH), RUNNER_AGENT_PRIVATE_KEY, ENGINE_OPERATOR_PRIVATE_KEY,
//   MANDATE_REGISTRY, DECISION_LOG, RUNNER_INTERVAL_MS (300000), TYPESAFE_API_KEY, GEMINI_API_KEY, GROQ_API_KEY (rationale fallback),
//   AGENT_REGISTRY (optional, #12: real Bond Minimum checks; Lead Agents are reported to it)
//   PROTECTION_FUND (optional, #15: Overshoot claims and the Coverage Ratio go to it; its Epochs are the engine's)
//   FEE_ROUTER (optional, #17: Epoch settlement of fees and premiums)
//   NEAR_ENGINE_PRIVATE_KEY (optional: NEAR Kill Switch, Decision Commitments and agent payouts), RUNNER_NEAR_ACCOUNT (the runner's Vault's NEAR account)

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HyperEvmChain } from "../src/adapters/hyperevm.js";
import { HyperliquidExchange } from "../src/adapters/hyperliquid.js";
import {
  AgentWalletStore,
  createEngine,
  createNearLink,
  createRunner,
  FundingArbAgent,
  fallbackRationaleWriter,
  geminiRationaleWriter,
  groqRationaleWriter,
  jevLeadSelector,
  leaderboard,
  MeanReversionAgent,
  MomentumAgent,
  type AgentProfile,
  type RunnerRecord,
  startHttp,
} from "../src/index.js";
import { liveNear } from "../src/near/live.js";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? (fallback ? process.env[fallback] : undefined);
  if (!v) throw new Error(`Set ${k}${fallback ? ` (or ${fallback})` : ""} in engine/.env.local`);
  return v;
};

// Checksum form, whatever case the env var is in: the UI sends checksummed addresses, and Vault ids are compared as strings.
const vaultId = getAddress(env("RUNNER_VAULT", "SMOKE_VAULT"));
/** Maps an address in any case to the id the engine uses for this Vault. */
const canonical = (id: string) => (id.toLowerCase() === vaultId.toLowerCase() ? vaultId : id);
const asset = process.env.RUNNER_ASSET ?? "ETH";
const agent = privateKeyToAccount(env("RUNNER_AGENT_PRIVATE_KEY", "SMOKE_AGENT_PRIVATE_KEY") as Hex);
const operator = privateKeyToAccount(env("ENGINE_OPERATOR_PRIVATE_KEY", "SMOKE_OWNER_PRIVATE_KEY") as Hex);
const intervalMs = Number(process.env.RUNNER_INTERVAL_MS ?? 300_000);

const exchange = new HyperliquidExchange({ isTestnet: true, agentFor: () => agent });
const chain = new HyperEvmChain({ mandateRegistry: env("MANDATE_REGISTRY", "SMOKE_MANDATE_REGISTRY") as Address, decisionLog: env("DECISION_LOG", "SMOKE_DECISION_LOG") as Address, engine: operator, ...(process.env.AGENT_REGISTRY ? { agentRegistry: process.env.AGENT_REGISTRY as Address } : {}), ...(process.env.PROTECTION_FUND ? { protectionFund: process.env.PROTECTION_FUND as Address } : {}), ...(process.env.FEE_ROUTER ? { feeRouter: process.env.FEE_ROUTER as Address } : {}) });
// Gemini writes the rationales, with Groq as the fallback; if both fail, the agent's template wording stays (ADR-0005).
const rationaleWriters = [
  ...(process.env.GEMINI_API_KEY ? [{ name: "Gemini", write: geminiRationaleWriter() }] : []),
  ...(process.env.GROQ_API_KEY ? [{ name: "Groq", write: groqRationaleWriter() }] : []),
];

// NEAR (ADR-0007): the Vault's NEAR account owns its Kill Switch, and Decision Commitments and Builder payouts are
// mirrored to the Sapien Contract. Off without NEAR_ENGINE_PRIVATE_KEY.
const agentWallets = new AgentWalletStore(`${root}.data/agent-wallets.json`);
const nearOn = !!process.env.NEAR_ENGINE_PRIVATE_KEY;
const live = nearOn ? liveNear(root, agentWallets, operator) : undefined;
const nearLink = live
  ? createNearLink({
      near: live.near,
      accountOf: (v) => live.vaults.byVault(v)?.account ?? (v.toLowerCase() === vaultId.toLowerCase() ? process.env.RUNNER_NEAR_ACCOUNT : undefined),
    })
  : undefined;
const engine = createEngine({ exchange, chain: nearLink ? nearLink.wrap(chain) : chain });

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
  ...(nearLink ? { isKilled: nearLink.isKilled } : {}),
  roster,
  agents: [new MomentumAgent(), new FundingArbAgent(), new MeanReversionAgent()],
  onVetoWindow: (vault, p) =>
    console.log(`Veto Window open on ${vault}: ${p.agentId} ${p.side} ${p.size} ${p.asset} (${p.notional.toFixed(0)} USDC) until ${new Date(p.expiresAt).toISOString()}`),
  select: process.env.TYPESAFE_API_KEY ? jevLeadSelector() : async () => { throw new Error("TYPESAFE_API_KEY not set"); },
  // Agents size within the Mandate's leverage cap, and the Allocator skips agents below their Bond Minimum.
  leverageCap: async (v) => (await chain.currentMandate(v)).leverageCap,
  belowBondMinimum: async (ids) => {
    const below = new Set<string>();
    for (const id of ids) if (!(await chain.meetsBondMinimum(id))) below.add(id);
    return below;
  },
  write: fallbackRationaleWriter(
    rationaleWriters.map((w) => w.write),
    (i, e) => console.log(`Rationale: ${rationaleWriters[i]!.name} failed (${String(e).slice(0, 120)}), trying ${rationaleWriters[i + 1]!.name}`),
  ),
  log,
});

const readHistory = () => readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunnerRecord);
// The leaderboard polls; HyperCore fills are cached for 30s.
let fillsCache: { at: number; fills: Awaited<ReturnType<typeof exchange.fills>> } | undefined;
async function recentFills() {
  if (!fillsCache || Date.now() - fillsCache.at > 30_000) fillsCache = { at: Date.now(), fills: await exchange.fills(vaultId) };
  return fillsCache.fills;
}

const http = await startHttp({
  port: Number(process.env.ENGINE_PORT ?? 8787),
  host: process.env.ENGINE_HOST ?? "127.0.0.1",
  agentWallets,
  ...(live ? { nearVaults: live.service } : {}),
  feed: () => recent,
  leaderboard: async () =>
    leaderboard({
      roster,
      history: readHistory(),
      leads: new Map([[vaultId, engine.vaultStatus(vaultId).leadAgent?.agentId]]),
      fills: await recentFills(),
    }),
  // Replay can open any past decision, not only the last 500: read the whole log on request.
  history: () => readHistory(),
  vaultStatus: (id) => engine.vaultStatus(canonical(id)),
  kill: async (id) => {
    const vault = canonical(id);
    const result = await engine.handle({ type: "kill-switch", vaultId: vault });
    log({ at: Date.now(), vaultId: vault, asset, result, note: result.kind === "killed" ? "Kill Switch" : `Kill Switch refused: ${result.kind === "kill-refused" ? result.reason : result.kind}` });
    return result;
  },
  veto: async (id, proposalId) => {
    const vault = canonical(id);
    const result = await engine.handle({ type: "veto", vaultId: vault, proposalId });
    if (result.kind === "vetoed") log({ at: Date.now(), vaultId: vault, asset, result, note: "Vetoed by the user" });
    return result;
  },
  ...(process.env.ENGINE_ALLOW_ORIGIN ? { allowOrigin: process.env.ENGINE_ALLOW_ORIGIN } : {}),
});
console.log(`Engine running: Vault ${vaultId} on ${asset}, every ${intervalMs / 1000}s. HTTP ${http.url}`);
// Verify the Vault's Mandate now, so the first Trade Proposal doesn't wait on the signing-block search (slow where
// the testnet RPC skips old blocks); each verified Mandate Version is cached.
const warm = Date.now();
chain.currentMandate(vaultId).then(
  (m) => console.log(`Mandate v${m.version} verified in ${((Date.now() - warm) / 1000).toFixed(0)}s`),
  (e) => console.error(`Mandate warm-up failed: ${(e as Error).message.split("\n")[0]}`),
);

// The AgentRegistry sets each agent's Bond Minimum from the Vaults it leads, so report every Lead Agent change.
let reportedLead: string | undefined | null = null;
async function reportLead() {
  const lead = engine.vaultStatus(vaultId).leadAgent?.agentId;
  if (!process.env.AGENT_REGISTRY || lead === reportedLead) return;
  await chain.reportLead(vaultId, lead, await exchange.accountValue(vaultId));
  reportedLead = lead;
}

// Epochs (#17): the ProtectionFund's (24h from its deployment), else UTC days. Each is settled once, on the first loop in it.
const epochFile = `${root}.data/epoch.json`;
let settledEpoch = existsSync(epochFile) ? (JSON.parse(readFileSync(epochFile, "utf8")) as { epoch: number }).epoch : -1;
async function maybeSettleEpoch() {
  const epoch = process.env.PROTECTION_FUND ? await chain.currentEpoch() : Math.floor(Date.now() / 86_400_000);
  if (epoch <= settledEpoch) return;
  await runner.epoch(epoch);
  settledEpoch = epoch;
  writeFileSync(epochFile, JSON.stringify({ epoch }));
}

for (;;) {
  await runner.tick();
  await maybeSettleEpoch().catch((e) => console.error(`Epoch: ${(e as Error).message}`));
  await reportLead().catch((e) => console.error(`AgentRegistry.reportLead: ${(e as Error).message}`));
  await new Promise((r) => setTimeout(r, intervalMs));
}
