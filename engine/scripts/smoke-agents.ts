// Live, read-only smoke for #13: Regime on real testnet candles, the Momentum agent's decision, Jev choosing the
// Lead Agent among eligible agents, and Gemini writing the rationale. Places no orders.
//
//   engine/.env.local: TYPESAFE_API_KEY (Jev), GEMINI_API_KEY (optional: without it the template rationale stays)
//   npm run smoke:agents [-- BTC]

import { existsSync } from "node:fs";
import { HyperliquidExchange } from "../src/adapters/hyperliquid.js";
import { allocateWithJev, classifyRegime, geminiRationaleWriter, jevLeadSelector, MomentumAgent, type AgentProfile } from "../src/index.js";

const envFile = new URL("../.env.local", import.meta.url).pathname;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const asset = process.argv[2] ?? "BTC";
const exchange = new HyperliquidExchange({ isTestnet: true, agentFor: () => { throw new Error("read-only"); } });

const [candles4h, fundingRateHourly, markPrice] = await Promise.all([exchange.candles4h(asset), exchange.fundingRateHourly(asset), exchange.markPrice(asset)]);
const snapshot = { asset, candles4h, fundingRateHourly, markPrice };
const reading = classifyRegime(snapshot);
console.log(`\n${asset}: ${candles4h.length} closed 4h candles, mark ${markPrice}, funding ${fundingRateHourly}/h`);
console.log("Regime:", reading);

// Placeholder roster until the AgentRegistry (#12) supplies real Bonds and track records.
const roster: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [0.012, 0.018, -0.004, 0.01] },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 600, epochReturns: [] },
  { agentId: "basis-arb-demo", regimes: ["funding-skew"], bondUsdc: 900, epochReturns: [0.004, 0.006, -0.001, 0.005] },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, epochReturns: [0.006, 0.004, 0.009] },
  { agentId: "trend-follower-demo", regimes: ["trend", "chop"], bondUsdc: 300, epochReturns: [0.02, 0.025] },
];
const decision = await allocateWithJev(
  { regime: reading.regime, agents: roster, current: undefined, vaultIsFlat: true, market: { asset, ...reading.metrics } },
  process.env.TYPESAFE_API_KEY ? jevLeadSelector() : async () => { throw new Error("TYPESAFE_API_KEY not set"); },
);
console.log("\nAllocation:", decision);

const momentum = new MomentumAgent();
const proposal = momentum.decide(snapshot, { vaultId: "demo-vault", accountValue: 1_000, position: 0 });
if (!proposal) console.log("\nMomentum: no breakout on the latest candle, so no proposal.");
else {
  const explained = process.env.GEMINI_API_KEY ? await momentum.explain(proposal, geminiRationaleWriter()) : proposal;
  console.log("\nMomentum proposal:", { side: explained.side, size: explained.size, confidence: explained.confidence });
  console.log("Rationale:", explained.rationale, process.env.GEMINI_API_KEY ? "(Gemini)" : "(template: GEMINI_API_KEY not set)");
}
