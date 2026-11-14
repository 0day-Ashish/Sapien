import { hashDecision, type DecisionRecord, type Execution, type ReplayItem } from "../engine/replay";
import type { BoardRow } from "../engine/leaderboard";

// Demo content for the Mandate app's sidebar views, shown (and labelled as an illustration) when the engine is
// unreachable, has no data yet, or no wallet is connected. Numbers are made up but follow the product's rules.

const DEMO_VAULT = "0xde30000000000000000000000000000000000001";
const HOUR = 3_600_000;

export const DEMO_LEADERBOARD: BoardRow[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, riskAdjustedReturn: { value: 1.84, usedPrior: false, epochs: 9 }, vaultsLed: ["demo-1", "demo-2"], vaultsLedCount: 2, proposals: 41, executed: 33, rejected: 8, fills: 61, filledNotionalUsdc: 18_420, bondSource: "engine" },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 600, riskAdjustedReturn: { value: 1.37, usedPrior: false, epochs: 7 }, vaultsLed: ["demo-3"], vaultsLedCount: 1, proposals: 27, executed: 24, rejected: 3, fills: 44, filledNotionalUsdc: 9_870, bondSource: "engine" },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, riskAdjustedReturn: { value: 0.92, usedPrior: false, epochs: 6 }, vaultsLed: [], vaultsLedCount: 0, proposals: 35, executed: 26, rejected: 9, fills: 47, filledNotionalUsdc: 11_305, bondSource: "engine" },
  { agentId: "basis-arb", regimes: ["funding-skew"], bondUsdc: 900, riskAdjustedReturn: { value: 0.5, usedPrior: true, epochs: 1 }, vaultsLed: [], vaultsLedCount: 0, proposals: 6, executed: 5, rejected: 1, fills: 8, filledNotionalUsdc: 2_140, bondSource: "engine" },
  { agentId: "trend-follower", regimes: ["trend", "chop"], bondUsdc: 300, riskAdjustedReturn: { value: -0.41, usedPrior: false, epochs: 4 }, vaultsLed: [], vaultsLedCount: 0, proposals: 18, executed: 11, rejected: 7, fills: 15, filledNotionalUsdc: 3_960, bondSource: "engine" },
];

type DemoDecision = { at: number; regime: string; metrics: ReplayItem["metrics"]; allocationReason: string; decision: DecisionRecord; execution: Execution };

function decisions(now: number): DemoDecision[] {
  const base = (id: string, over: Partial<DecisionRecord["proposal"]>): DecisionRecord["proposal"] => ({
    type: "trade-proposal",
    proposalId: id,
    vaultId: DEMO_VAULT,
    agentId: "momentum",
    asset: "ETH",
    side: "long",
    size: 0.15,
    leverage: 2,
    intent: "open",
    confidence: 0.72,
    rationale: "",
    ...over,
  });
  return [
    {
      at: now - 2 * HOUR,
      regime: "trend",
      metrics: { realizedVol: 0.0184, trendStrength: 2.41, fundingRateHourly: 0.0000081 },
      allocationReason: "trend: momentum has the highest Bond × risk-adjusted return (1000 USDC × Sharpe 1.84)",
      decision: {
        proposal: base("momentum-ETH-demo-1", { rationale: "ETH closed above its 20-candle 4h high with rising volume while funding stays neutral, so the breakout has room to run." }),
        mandateVersion: 3,
        markPrice: 3187.45,
        order: { limitPrice: 3219.3245, entryCloid: "0x6d6f6d656e74756d2d6574682d303031", stopLoss: { cloid: "0x6d6f6d656e74756d2d736c2d30303031", triggerPrice: 3123.701 } },
      },
      execution: { entry: { status: "filled", fill: { price: 3189.1, size: 0.15, at: now - 2 * HOUR + 900, closedPnl: 0 } }, stop: { status: "open" } },
    },
    {
      at: now - 7 * HOUR,
      regime: "funding-skew",
      metrics: { realizedVol: 0.0121, trendStrength: 0.38, fundingRateHourly: 0.000142 },
      allocationReason: "funding-skew: funding-arb has the highest Bond × risk-adjusted return (600 USDC × Sharpe 1.37)",
      decision: {
        proposal: base("funding-arb-BTC-demo-2", {
          agentId: "funding-arb",
          asset: "BTC",
          side: "short",
          size: 0.004,
          leverage: 1,
          confidence: 0.64,
          rationale: "Longs are paying 0.014% an hour, well above the 30-day average, so a small short collects funding while the price drifts sideways.",
        }),
        mandateVersion: 3,
        markPrice: 64_820,
        order: { limitPrice: 64_171.8, entryCloid: "0x66756e64696e672d6172622d30303032", stopLoss: { cloid: "0x66756e64696e672d736c2d3030303032", triggerPrice: 66_116.4 } },
      },
      execution: { entry: { status: "filled", fill: { price: 64_806.5, size: 0.004, at: now - 7 * HOUR + 700, closedPnl: 0 } }, stop: { status: "canceled" } },
    },
    {
      at: now - 26 * HOUR,
      regime: "trend",
      metrics: { realizedVol: 0.0263, trendStrength: -1.12, fundingRateHourly: 0.0000032 },
      allocationReason: "trend: momentum leads",
      decision: {
        proposal: base("momentum-ETH-demo-3", { size: 0.12, confidence: 0.58, rationale: "ETH reclaimed its range high; entering long with the stop 2% below entry, as the Mandate requires." }),
        mandateVersion: 2,
        markPrice: 3241.2,
        order: { limitPrice: 3273.612, entryCloid: "0x6d6f6d656e74756d2d6574682d303033", stopLoss: { cloid: "0x6d6f6d656e74756d2d736c2d30303033", triggerPrice: 3176.376 } },
      },
      // The stop-loss fired in a gap: the fill landed below the trigger (Overshoot, paid from the Bond).
      execution: { entry: { status: "filled", fill: { price: 3243.0, size: 0.12, at: now - 26 * HOUR + 800, closedPnl: 0 } }, stop: { status: "filled", fill: { price: 3161.9, size: 0.12, at: now - 23 * HOUR, closedPnl: -9.73 } } },
    },
  ];
}

export type DemoReplayItem = ReplayItem & { demoExecution: Execution };

/** Demo decisions with real hashes, so the commitment check and tamper sandbox behave as they do for live ones. */
export async function demoReplayItems(now = Date.now()): Promise<DemoReplayItem[]> {
  return Promise.all(
    decisions(now).map(async (d, i) => {
      const decisionHash = await hashDecision(d.decision);
      return {
        at: d.at,
        vaultId: DEMO_VAULT,
        asset: d.decision.proposal.asset,
        regime: d.regime,
        metrics: d.metrics,
        markPrice: d.decision.markPrice,
        allocation: { leadAgentId: d.decision.proposal.agentId, reason: d.allocationReason, source: "rules" },
        result: {
          kind: "executed" as const,
          proposalId: d.decision.proposal.proposalId,
          decision: d.decision,
          decisionHash,
          commitmentTx: `0x${(i + 1).toString(16).padStart(2, "0")}${decisionHash.slice(4)}`,
          order: { entryCloid: d.decision.order.entryCloid, stopLossCloid: d.decision.order.stopLoss?.cloid, placedAt: d.at + 500 },
          ...(d.decision.order.stopLoss ? { stopLoss: { ...d.decision.order.stopLoss, placedAt: d.at + 500 } } : {}),
        },
        demoExecution: d.execution,
      };
    }),
  );
}

export const DEMO_FUNDS = {
  vault: DEMO_VAULT,
  balanceUsdc: 1_250.42,
  isFlat: true,
  deposit: { amountUsdc: 250, feeUsdc: 0.13 },
};

export const DEMO_BOND = {
  agentId: "momentum",
  regimes: ["Trend"],
  bondUsdc: 1_000,
  bondMinimumUsdc: 62.5,
  ledVaults: 2,
  ledValueUsdc: 1_250,
};
