import { describe, expect, it } from "vitest";
import { allocate, type AgentProfile } from "../src/agents/allocator.js";
import { createEngine, type TradeProposal } from "../src/index.js";
import { fakePorts } from "../src/testing/fakes.js";

const agents: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [0.01, 0.02, 0.015, 0.01] },
  { agentId: "trend-follower", regimes: ["trend"], bondUsdc: 400, epochReturns: [0.03, 0.02, 0.025, 0.03] },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, epochReturns: [0.005, 0.01, -0.002, 0.008] },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 500, epochReturns: [] },
];

describe("Allocator", () => {
  it("picks, among agents declaring the Regime, the highest Bond × risk-adjusted return", () => {
    const d = allocate({ regime: "trend", agents, current: undefined, vaultIsFlat: true });
    // momentum: 1000 × Sharpe(…) beats trend-follower's 400 × a higher Sharpe in these fixtures.
    expect(d.leadAgentId).toBe("momentum");
    expect(d.reason).toMatch(/trend/);
    expect(d.reason).toMatch(/Bond/);
  });

  it("uses a fixed prior for an agent without a track record", () => {
    const d = allocate({ regime: "funding-skew", agents, current: undefined, vaultIsFlat: true });
    expect(d.leadAgentId).toBe("funding-arb");
    expect(d.reason).toMatch(/prior/);
  });

  it("skips agents below their Bond Minimum", () => {
    const d = allocate({ regime: "trend", agents, current: undefined, vaultIsFlat: true, belowBondMinimum: new Set(["momentum"]) });
    expect(d.leadAgentId).toBe("trend-follower");
  });

  it("assigns nobody when no eligible agent declares the Regime", () => {
    const d = allocate({ regime: "high-volatility", agents, current: undefined, vaultIsFlat: true });
    expect(d.leadAgentId).toBeUndefined();
    expect(d.reason).toMatch(/no eligible/i);
  });

  it("switches immediately when the Vault is Flat", () => {
    const d = allocate({ regime: "chop", agents, current: "momentum", vaultIsFlat: true });
    expect(d).toMatchObject({ leadAgentId: "mean-reversion" });
    expect(d.pendingLeadAgentId).toBeUndefined();
  });

  it("defers a switch while the Vault has positions: the outgoing agent stays Lead, reduce-only", () => {
    const d = allocate({ regime: "chop", agents, current: "momentum", vaultIsFlat: false });
    expect(d).toMatchObject({ leadAgentId: "momentum", pendingLeadAgentId: "mean-reversion" });
  });

  it("is deterministic", () => {
    const input = { regime: "trend" as const, agents, current: undefined, vaultIsFlat: true };
    expect(allocate(input)).toEqual(allocate(input));
  });
});

describe("Lead Agent rules in the engine", () => {
  const proposal = (over: Partial<TradeProposal> = {}): TradeProposal => ({
    type: "trade-proposal",
    proposalId: `p-${Math.random()}`,
    vaultId: "vault-1",
    agentId: "momentum",
    asset: "BTC",
    side: "long",
    size: 0.01,
    leverage: 2,
    intent: "open",
    confidence: 0.7,
    rationale: "test",
    ...over,
  });

  function setup() {
    const ports = fakePorts();
    ports.exchange.marks.set("BTC", 65_000);
    const engine = createEngine(ports);
    return { ports, engine };
  }

  it("rejects proposals from an agent that isn't the Vault's Lead Agent", async () => {
    const { ports, engine } = setup();
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", reason: "trend" });

    const r = await engine.handle(proposal({ agentId: "mean-reversion" }));
    expect(r).toMatchObject({ kind: "rejected", rejection: { code: "not-lead-agent" } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("defers a switch: the outgoing agent's opening proposal is rejected, its reduce goes through", async () => {
    const { ports, engine } = setup();
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", reason: "trend" });
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", pendingLeadAgentId: "mean-reversion", reason: "chop" });

    expect(await engine.handle(proposal())).toMatchObject({ kind: "rejected", rejection: { code: "outgoing-lead-agent" } });
    expect((await engine.handle(proposal({ intent: "reduce" }))).kind).toBe("executed");
    // The incoming agent can't trade until the switch completes.
    expect(await engine.handle(proposal({ agentId: "mean-reversion" }))).toMatchObject({ kind: "rejected", rejection: { code: "not-lead-agent" } });
    expect(engine.vaultStatus("vault-1").leadAgent).toMatchObject({ agentId: "momentum", pendingAgentId: "mean-reversion" });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("completes the deferred switch once a fill leaves the Vault Flat", async () => {
    const { ports, engine } = setup();
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", reason: "trend" });
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", pendingLeadAgentId: "mean-reversion", reason: "chop" });
    ports.exchange.positionsByVault.set("vault-1", []);
    await engine.handle({ type: "fill", vaultId: "vault-1", orderId: "x", price: 65_000, size: 0.01, at: Date.now() });

    expect(engine.vaultStatus("vault-1").leadAgent).toMatchObject({ agentId: "mean-reversion" });
    expect(engine.vaultStatus("vault-1").leadAgent?.pendingAgentId).toBeUndefined();
    expect((await engine.handle(proposal({ agentId: "mean-reversion" }))).kind).toBe("executed");
    expect(await engine.handle(proposal())).toMatchObject({ kind: "rejected", rejection: { code: "not-lead-agent" } });
  });

  it("shows the Lead Agent and why it was chosen", async () => {
    const { engine } = setup();
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", reason: "trend: momentum has the highest Bond × Sharpe" });
    expect(engine.vaultStatus("vault-1").leadAgent).toEqual({ agentId: "momentum", reason: "trend: momentum has the highest Bond × Sharpe" });
  });
});
