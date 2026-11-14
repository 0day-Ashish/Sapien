import { describe, expect, it } from "vitest";
import { createEngine, leaderboard, type RunnerRecord, type TradeProposal } from "../src/index.js";
import type { AgentProfile } from "../src/agents/allocator.js";
import { fakePorts } from "../src/testing/fakes.js";

const roster: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [0.01, 0.02, 0.015] },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 600, epochReturns: [] },
];

/** Runs proposals through a real engine on fake ports, as the runner would, and returns its records. */
async function history(proposals: Partial<TradeProposal>[]) {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", 65_000);
  const engine = createEngine(ports);
  const records: RunnerRecord[] = [];
  let at = 1;
  for (const over of proposals) {
    const proposal: TradeProposal = {
      type: "trade-proposal",
      proposalId: `p-${at}`,
      vaultId: "0xV",
      agentId: "momentum",
      asset: "BTC",
      side: "long",
      size: 0.001,
      leverage: 2,
      intent: "open",
      confidence: 0.7,
      rationale: "r",
      ...over,
    };
    records.push({ at: at++, vaultId: "0xV", asset: "BTC", proposal, result: await engine.handle(proposal) });
  }
  return { records, ports };
}

describe("Leaderboard", () => {
  it("counts each agent's proposals, executions and rejections from the event store", async () => {
    const { records } = await history([{}, { leverage: 99 }, { agentId: "funding-arb" }]);
    const rows = leaderboard({ roster, history: records, leads: new Map(), fills: [] });

    expect(rows.find((r) => r.agentId === "momentum")).toMatchObject({ proposals: 2, executed: 1, rejected: 1, lastActiveAt: 2 });
    expect(rows.find((r) => r.agentId === "funding-arb")).toMatchObject({ proposals: 1, executed: 1, rejected: 0 });
  });

  it("attributes real fills to the agent whose order they filled, by cloid", async () => {
    const { records, ports } = await history([{}]);
    const order = ports.exchange.orders[0]!;
    const fills = [
      { orderId: "1", cloid: order.entryCloid, price: 65_010, size: 0.001, at: 5 },
      { orderId: "2", cloid: order.stopLoss.cloid, price: 63_700, size: 0.001, at: 9 },
      { orderId: "3", price: 1, size: 1, at: 9 }, // not ours
    ];
    const momentum = leaderboard({ roster, history: records, leads: new Map(), fills }).find((r) => r.agentId === "momentum")!;
    expect(momentum.fills).toBe(2);
    expect(momentum.filledNotionalUsdc).toBeCloseTo(65.01 + 63.7);
  });

  it("shows the Vaults each agent leads now, its Bond, and its risk-adjusted return (prior for new agents)", () => {
    const rows = leaderboard({ roster, history: [], leads: new Map([["0xV", "funding-arb"], ["0xW", undefined]]), fills: [] });
    const [first, second] = rows;
    expect(first).toMatchObject({ agentId: "momentum", bondUsdc: 1_000, vaultsLed: [], riskAdjustedReturn: { usedPrior: false, epochs: 3 } });
    expect(first!.riskAdjustedReturn.value).toBeCloseTo(3);
    expect(second).toMatchObject({ agentId: "funding-arb", vaultsLed: ["0xV"], riskAdjustedReturn: { value: 0.5, usedPrior: true, epochs: 0 } });
  });

  it("includes agents that traded but aren't on the roster", async () => {
    const { records } = await history([{ agentId: "mean-reversion" }]);
    expect(leaderboard({ roster, history: records, leads: new Map(), fills: [] }).map((r) => r.agentId)).toContain("mean-reversion");
  });
});
