// Live, read-only smoke for #13: Regime on real testnet candles, the Momentum agent's decision, Jev choosing the
// Lead Agent among eligible agents, and Gemini writing the rationale. Places no orders.
//
//   engine/.env.local: TYPESAFE_API_KEY (Jev), GEMINI_API_KEY (optional: without it the template rationale stays)
//   npm run smoke:agents [-- BTC]

import { existsSync } from "node:fs";
import { HyperliquidExchange } from "../src/adapters/hyperliquid.js";
import { allocateWithJev, classifyRegime, FundingArbAgent, geminiRationaleWriter, jevLeadSelector, MomentumAgent, type AgentProfile, type SpecialistAgent } from "../src/index.js";

const envFile = new URL("../.env.local", import.meta.url).pathname;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const asset = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "BTC";
const demoRoster = process.argv.includes("--demo-roster");
const exchange = new HyperliquidExchange({ isTestnet: true, agentFor: () => { throw new Error("read-only"); } });

const [candles4h, fundingRateHourly, fundingHistoryHourly, markPrice] = await Promise.all([exchange.candles4h(asset), exchange.fundingRateHourly(asset), exchange.fundingHistoryHourly(asset), exchange.markPrice(asset)]);
const snapshot = { asset, candles4h, fundingRateHourly, fundingHistoryHourly, markPrice };
const reading = classifyRegime(snapshot);
console.log(`\n${asset}: ${candles4h.length} closed 4h candles, mark ${markPrice}, funding ${fundingRateHourly}/h`);
console.log("Regime:", reading);

// Placeholder roster until the AgentRegistry (#12) supplies real Bonds and track records.
const roster: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [0.012, 0.018, -0.004, 0.01] },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 600, epochReturns: [] },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, epochReturns: [0.006, 0.004, 0.009] },
  // --demo-roster: extra made-up candidates so Jev has a real choice in every Regime.
  ...(demoRoster
    ? [
        { agentId: "basis-arb-demo", regimes: ["funding-skew"], bondUsdc: 900, epochReturns: [0.004, 0.006, -0.001, 0.005] },
        { agentId: "trend-follower-demo", regimes: ["trend", "chop"], bondUsdc: 300, epochReturns: [0.02, 0.025] },
      ] satisfies AgentProfile[]
    : []),
];
const decision = await allocateWithJev(
  { regime: reading.regime, agents: roster, current: undefined, vaultIsFlat: true, market: { asset, ...reading.metrics } },
  process.env.TYPESAFE_API_KEY ? jevLeadSelector() : async () => { throw new Error("TYPESAFE_API_KEY not set"); },
);
console.log("\nAllocation:", decision);

console.log(`Funding, last ${fundingHistoryHourly.length}h:`, fundingHistoryHourly.map((f) => `${(f * 100).toFixed(3)}%`).join(" "));

// What the Lead Agent (and, for comparison, the others) would propose right now on a flat 1,000 USDC Vault.
const agents: SpecialistAgent[] = [new FundingArbAgent(), new MomentumAgent()];
for (const agent of agents) {
  const p = agent.decide(snapshot, { vaultId: "demo-vault", accountValue: 1_000, position: 0 });
  const lead = agent.agentId === decision.leadAgentId ? " (Lead Agent)" : "";
  if (!p) {
    console.log(`\n${agent.agentId}${lead}: no proposal.`);
    continue;
  }
  const explained = process.env.GEMINI_API_KEY ? await agent.explain(p, geminiRationaleWriter()) : p;
  console.log(`\n${agent.agentId}${lead}:`, { side: explained.side, size: explained.size, leverage: explained.leverage, confidence: explained.confidence });
  console.log("Rationale:", explained.rationale, process.env.GEMINI_API_KEY ? "(Gemini)" : "(template)");
}
