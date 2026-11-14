import { describe, expect, it } from "vitest";
import type { AgentProfile } from "../src/agents/allocator.js";
import { allocateWithJev, type LeadSelector } from "../src/agents/jev-allocator.js";

const agents: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [0.01, 0.02, 0.015, 0.01] },
  { agentId: "trend-follower", regimes: ["trend"], bondUsdc: 400, epochReturns: [0.03, 0.02, 0.025, 0.03] },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, epochReturns: [0.005, 0.01] },
];

const picks = (agentId: string): LeadSelector & { calls: Parameters<LeadSelector>[0][] } => {
  const calls: Parameters<LeadSelector>[0][] = [];
  const f = async (state: Parameters<LeadSelector>[0]) => {
    calls.push(state);
    return { agentId, probabilities: { [agentId]: 0.8, other: 0.2 }, confidence: 0.8 };
  };
  return Object.assign(f, { calls });
};

describe("Allocator with Jev choosing the Lead Agent", () => {
  it("uses Jev's pick among the eligible agents, and shows its probabilities as the reason", async () => {
    const select = picks("trend-follower");
    const d = await allocateWithJev({ regime: "trend", agents, current: undefined, vaultIsFlat: true }, select);

    expect(d).toMatchObject({ leadAgentId: "trend-follower", source: "jev", confidence: 0.8 });
    expect(d.reason).toMatch(/Jev chose trend-follower \(confidence 80%/);
  });

  it("only offers Jev the agents the rules allow (Regime declared, Bond Minimum met)", async () => {
    const select = picks("momentum");
    await allocateWithJev({ regime: "trend", agents: [...agents, { agentId: "x", regimes: ["trend"], bondUsdc: 9_999, epochReturns: [] }], current: undefined, vaultIsFlat: true, belowBondMinimum: new Set(["x"]) }, select);

    expect(select.calls[0]!.candidates.map((c) => c.agentId)).toEqual(["momentum", "trend-follower"]);
    expect(select.calls[0]!.regime).toBe("trend");
  });

  it("falls back to the rules when Jev picks an ineligible agent", async () => {
    const d = await allocateWithJev({ regime: "trend", agents, current: undefined, vaultIsFlat: true }, picks("mean-reversion"));
    expect(d).toMatchObject({ leadAgentId: "momentum", source: "rules" });
    expect(d.reason).toMatch(/Jev unavailable \(Jev picked mean-reversion, which is not eligible\)/);
  });

  it("falls back to the rules when Jev fails", async () => {
    const d = await allocateWithJev({ regime: "trend", agents, current: undefined, vaultIsFlat: true }, async () => {
      throw new Error("401 invalid API key");
    });
    expect(d).toMatchObject({ leadAgentId: "momentum", source: "rules" });
    expect(d.reason).toMatch(/401/);
  });

  it("still defers a switch until the Vault is Flat", async () => {
    const d = await allocateWithJev({ regime: "trend", agents, current: "momentum", vaultIsFlat: false }, picks("trend-follower"));
    expect(d).toMatchObject({ leadAgentId: "momentum", pendingLeadAgentId: "trend-follower", source: "jev" });
  });

  it("doesn't call Jev when there's at most one eligible agent", async () => {
    const select = picks("mean-reversion");
    const d = await allocateWithJev({ regime: "chop", agents, current: undefined, vaultIsFlat: true }, select);
    expect(select.calls).toHaveLength(0);
    expect(d).toMatchObject({ leadAgentId: "mean-reversion", source: "rules" });
  });
});
