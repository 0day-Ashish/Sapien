import { describe, expect, it } from "vitest";
import type { AgentProfile } from "../src/agents/allocator.js";
import { FundingArbAgent } from "../src/agents/funding-arb.js";
import type { LeadSelector } from "../src/agents/jev-allocator.js";
import { MeanReversionAgent } from "../src/agents/mean-reversion.js";
import { MomentumAgent } from "../src/agents/momentum.js";
import type { MarketSnapshot } from "../src/agents/types.js";
import { createEngine, leaderboard, type RunnerRecord, type TradeProposal } from "../src/index.js";
import { createRunner, type RunnerConfig } from "../src/runner/runner.js";
import { defaultMandate, fakePorts } from "../src/testing/fakes.js";
import { uptrendBreakout } from "./fixtures/candles.js";

// Bugs found where two parts of the trading path disagreed. Each test is the scenario that used to go wrong.

const proposal = (over: Partial<TradeProposal> = {}): TradeProposal => ({
  type: "trade-proposal",
  proposalId: "p-1",
  vaultId: "vault-1",
  agentId: "momentum",
  asset: "BTC",
  side: "long",
  size: 0.01,
  leverage: 2,
  intent: "open",
  confidence: 0.7,
  rationale: "breakout",
  ...over,
});

function setup(mandate = defaultMandate) {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", 65_000);
  ports.exchange.marks.set("ETH", 3_000);
  ports.exchange.accountValueByVault.set("vault-1", 1_000);
  ports.chain.mandates.set("vault-1", mandate);
  let t = Date.UTC(2026, 10, 14);
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  return { ports, engine: createEngine(ports, { now: clock.now }), clock };
}

const long = (size: number) => [{ asset: "BTC", size, entryPrice: 65_000 }];

describe("The Vault contract's Flat flag follows the exchange", () => {
  it("marks the Vault not-Flat before an opening order is sent", async () => {
    const { ports, engine } = setup();
    expect(await engine.handle(proposal())).toMatchObject({ kind: "executed" });

    expect(ports.chain.notFlatReports).toEqual(["vault-1"]);
    expect(await ports.chain.isFlat("vault-1")).toBe(false);
    expect(ports.journal.indexOf("chain.reportNotFlat")).toBeGreaterThan(ports.journal.indexOf("chain.commitDecision"));
    expect(ports.journal.indexOf("chain.reportNotFlat")).toBeLessThan(ports.journal.indexOf("exchange.placeOrderWithStopLoss"));
  });

  it("sends no order if the Vault can't be marked not-Flat", async () => {
    const { ports, engine } = setup();
    ports.chain.failNotFlatWith = "rpc down";

    const result = await engine.handle(proposal());

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "order-failed", message: expect.stringContaining("not-Flat") } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("doesn't report not-Flat again for a second open, or at all for a reduce", async () => {
    const { ports, engine } = setup();
    await engine.handle(proposal());
    await engine.handle(proposal({ proposalId: "p-2", asset: "ETH", size: 0.1 }));
    await engine.handle(proposal({ proposalId: "p-3", intent: "reduce" }));

    expect(ports.chain.notFlatReports).toEqual(["vault-1"]);
  });

  it("reports Flat when a stop-loss has emptied the Vault with no fill event", async () => {
    const { ports, engine } = setup();
    ports.exchange.positionsByVault.set("vault-1", long(0.01));
    await engine.handle(proposal());
    await engine.handle({ type: "positions-sync", vaultId: "vault-1" });
    expect(ports.chain.flatReports).toEqual([]); // still holding

    ports.exchange.positionsByVault.set("vault-1", []); // the stop-loss filled on the exchange
    await engine.handle({ type: "positions-sync", vaultId: "vault-1" });

    expect(ports.chain.flatReports).toEqual(["vault-1"]);
    expect(await ports.chain.isFlat("vault-1")).toBe(true);
  });

  it("reports Flat again after an order the exchange refused", async () => {
    const { ports, engine } = setup();
    ports.exchange.rejectOrdersWith = "insufficient margin";
    expect(await engine.handle(proposal())).toMatchObject({ kind: "rejected", rejection: { code: "order-failed" } });
    expect(await ports.chain.isFlat("vault-1")).toBe(false);

    await engine.handle({ type: "positions-sync", vaultId: "vault-1" });

    expect(await ports.chain.isFlat("vault-1")).toBe(true);
  });

  it("after a restart, corrects a contract that says Flat while a position is open", async () => {
    const { ports, engine } = setup(); // a fresh engine remembers nothing
    ports.exchange.positionsByVault.set("vault-1", long(0.01));
    ports.chain.flatByVault.set("vault-1", true);

    await engine.handle({ type: "positions-sync", vaultId: "vault-1" });

    expect(ports.chain.notFlatReports).toEqual(["vault-1"]);
  });

  it("sends no transaction while the contract already agrees with the exchange", async () => {
    const { ports, engine } = setup();
    await engine.handle({ type: "positions-sync", vaultId: "vault-1" });
    await engine.handle({ type: "positions-sync", vaultId: "vault-1" });

    expect(ports.chain.flatReports).toEqual([]);
    expect(ports.chain.notFlatReports).toEqual([]);
  });

  it("completes a deferred Lead Agent switch once the sync finds the Vault Flat", async () => {
    const { ports, engine } = setup();
    ports.exchange.positionsByVault.set("vault-1", long(0.01));
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", pendingLeadAgentId: "mean-reversion", reason: "regime changed" });

    ports.exchange.positionsByVault.set("vault-1", []);
    await engine.handle({ type: "positions-sync", vaultId: "vault-1" });

    expect(engine.vaultStatus("vault-1").leadAgent).toMatchObject({ agentId: "mean-reversion" });
  });
});

describe("A veto holds", () => {
  it("keeps a vetoed trade vetoed when the agent proposes it again", async () => {
    const { ports, engine } = setup({ ...defaultMandate, vetoThresholdUsdc: 500 });
    expect(await engine.handle(proposal())).toMatchObject({ kind: "veto-window" });
    expect(await engine.handle({ type: "veto", vaultId: "vault-1", proposalId: "p-1" })).toMatchObject({ kind: "vetoed" });

    // The next tick: same candle, same proposal id.
    expect(await engine.handle(proposal())).toEqual({ kind: "vetoed", proposalId: "p-1" });

    expect(engine.vaultStatus("vault-1").pendingVetoes).toBeUndefined();
    expect(ports.chain.commitments).toEqual([]);
    expect(ports.exchange.orders).toEqual([]);
  });

  it("doesn't carry a veto over to another Vault or another trade", async () => {
    const { ports, engine } = setup({ ...defaultMandate, vetoThresholdUsdc: 500 });
    ports.chain.mandates.set("vault-2", { ...defaultMandate, vetoThresholdUsdc: 500 });
    await engine.handle(proposal());
    await engine.handle({ type: "veto", vaultId: "vault-1", proposalId: "p-1" });

    expect(await engine.handle(proposal({ proposalId: "p-2" }))).toMatchObject({ kind: "veto-window" });
    expect(await engine.handle(proposal({ vaultId: "vault-2" }))).toMatchObject({ kind: "veto-window" });
  });
});

describe("Mandate Check on trades that reduce risk", () => {
  it("lets an agent close a position in an asset a tighter Mandate no longer allows", async () => {
    const { engine } = setup({ ...defaultMandate, allowedAssets: ["ETH"] });

    expect(await engine.handle(proposal({ intent: "close" }))).toMatchObject({ kind: "executed" });
    expect(await engine.handle(proposal({ proposalId: "p-2", intent: "reduce" }))).toMatchObject({ kind: "executed" });
    expect(await engine.handle(proposal({ proposalId: "p-3", intent: "open" }))).toMatchObject({ kind: "rejected", rejection: { code: "asset-not-allowed" } });
  });
});

describe("Drawdown ignores money moved in and out", () => {
  it("doesn't treat a withdrawal as a loss", async () => {
    const { ports, engine, clock } = setup();
    await engine.handle(proposal()); // sets this month's High-Water Mark at 1,000

    clock.advance(60_000);
    ports.exchange.flowsByVault.set("vault-1", [{ usdc: -200, at: clock.now() }]);
    ports.exchange.accountValueByVault.set("vault-1", 800); // 20% lower, all of it withdrawn

    expect(await engine.handle(proposal({ proposalId: "p-2" }))).toMatchObject({ kind: "executed" });
    expect(engine.vaultStatus("vault-1").automaticKill).toBeUndefined();
  });

  it("still fires on a real loss of the same size", async () => {
    const { ports, engine, clock } = setup();
    await engine.handle(proposal());

    clock.advance(60_000);
    ports.exchange.accountValueByVault.set("vault-1", 800);

    expect(await engine.handle(proposal({ proposalId: "p-2" }))).toMatchObject({ kind: "rejected", rejection: { code: "automatic-kill" } });
  });

  it("doesn't let a deposit hide a loss", async () => {
    const { ports, engine, clock } = setup();
    await engine.handle(proposal());

    clock.advance(60_000);
    ports.exchange.flowsByVault.set("vault-1", [{ usdc: 200, at: clock.now() }]);
    ports.exchange.accountValueByVault.set("vault-1", 1_000); // lost 200, deposited 200

    expect(await engine.handle(proposal({ proposalId: "p-2" }))).toMatchObject({ kind: "rejected", rejection: { code: "automatic-kill" } });
  });
});

/* ---------- Agents and the runner ---------- */

const trend: MarketSnapshot = { asset: "BTC", candles4h: uptrendBreakout, fundingRateHourly: 0.00001, markPrice: uptrendBreakout.at(-1)!.c };
const roster: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [] },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 600, epochReturns: [] },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, epochReturns: [] },
];
const neverCalled: LeadSelector = async () => {
  throw new Error("one candidate per Regime: Jev shouldn't be asked");
};

function runnerSetup(mandate = defaultMandate, extra: Partial<RunnerConfig> = {}) {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", trend.markPrice);
  ports.exchange.accountValueByVault.set("vault-1", 1_000);
  ports.chain.mandates.set("vault-1", mandate);
  const engine = createEngine(ports);
  const records: RunnerRecord[] = [];
  const runner = createRunner({
    engine,
    exchange: ports.exchange,
    market: { snapshot: async () => trend },
    vaults: [{ vaultId: "vault-1", asset: "BTC" }],
    roster,
    agents: [new MomentumAgent(), new FundingArbAgent(), new MeanReversionAgent()],
    select: neverCalled,
    log: (r) => records.push(r),
    fillDelayMs: 0,
    leverageCap: async (v) => (await ports.chain.currentMandate(v)).leverageCap,
    ...extra,
  });
  return { ports, engine, runner, records };
}

describe("Agents trade inside the Mandate's leverage cap", () => {
  it("opens at the cap when the cap is under the agent's own target, instead of being rejected every tick", async () => {
    const { ports, runner, records } = runnerSetup({ ...defaultMandate, leverageCap: 1.5 });
    await runner.tick();

    expect(records[0]).toMatchObject({ proposal: { leverage: 1 }, result: { kind: "executed" } });
    expect(ports.exchange.leverage).toEqual([{ vaultId: "vault-1", asset: "BTC", leverage: 1 }]);
  });

  it("keeps its own target when the cap is higher, and sizes the order by the leverage it uses", async () => {
    const capped = runnerSetup({ ...defaultMandate, leverageCap: 1 });
    const roomy = runnerSetup({ ...defaultMandate, leverageCap: 5 });
    await capped.runner.tick();
    await roomy.runner.tick();

    expect(roomy.records[0]!.proposal).toMatchObject({ leverage: 2 });
    expect(roomy.records[0]!.proposal!.size).toBeCloseTo(capped.records[0]!.proposal!.size * 2);
  });
});

describe("Funding-arb proposal ids", () => {
  const snapshot = (fundingRateHourly: number): MarketSnapshot => ({ asset: "BTC", candles4h: uptrendBreakout, fundingRateHourly, markPrice: 65_000 });
  const vault = { vaultId: "vault-1", accountValue: 1_000, position: 0 };

  it("stay the same from tick to tick while the funding rate drifts", () => {
    const agent = new FundingArbAgent();
    const first = agent.decide(snapshot(0.0005), vault);
    const next = agent.decide(snapshot(0.00051), vault);

    expect(first?.proposalId).toBeDefined();
    expect(next?.proposalId).toBe(first?.proposalId);
  });

  it("differ between opening long and opening short in the same candle", () => {
    const agent = new FundingArbAgent();
    expect(agent.decide(snapshot(0.0005), vault)?.proposalId).not.toBe(agent.decide(snapshot(-0.0005), vault)?.proposalId);
  });
});

describe("Runner", () => {
  it("syncs the Flat flag on every tick, so a stop-out between ticks unlocks withdrawal", async () => {
    const { ports, runner } = runnerSetup();
    await runner.tick(); // opens: not-Flat
    expect(await ports.chain.isFlat("vault-1")).toBe(false);

    await runner.tick(); // nothing held on the exchange (the fake fills nothing): Flat again
    expect(await ports.chain.isFlat("vault-1")).toBe(true);
  });

  it("keeps the record of an executed close when the follow-up after the fill fails", async () => {
    const { ports, runner, records } = runnerSetup();
    ports.exchange.positionsByVault.set("vault-1", [{ asset: "BTC", size: -0.01, entryPrice: 65_000 }]); // short into an up-breakout: momentum closes it
    const reportFlat = ports.chain.reportFlat.bind(ports.chain);
    ports.chain.reportFlat = async (vaultId, isFlat) => {
      if (isFlat) throw new Error("rpc down");
      return reportFlat(vaultId, isFlat);
    };
    // The close fills, so the Vault is empty by the time the engine handles the fill and tries to report Flat.
    const placeReduceOnly = ports.exchange.placeReduceOnly.bind(ports.exchange);
    ports.exchange.placeReduceOnly = async (order) => {
      ports.exchange.positionsByVault.set("vault-1", []);
      return placeReduceOnly(order);
    };

    await runner.tick(); // syncs not-Flat, then the agent closes

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      proposal: { intent: "close" },
      result: { kind: "executed" },
      note: expect.stringMatching(/follow-up after the fill failed: rpc down/),
    });
    expect(records[0]!.error).toBeUndefined();
  });

  it("tells the Allocator who is below their Bond Minimum", async () => {
    const { engine, runner, records } = runnerSetup(defaultMandate, { belowBondMinimum: async () => new Set(["momentum"]) });
    await runner.tick();

    expect(engine.vaultStatus("vault-1").leadAgent?.agentId).not.toBe("momentum");
    expect(records[0]!.proposal).toBeUndefined();
  });

  it("stops proposing a vetoed trade after one record", async () => {
    const { ports, engine, runner, records } = runnerSetup({ ...defaultMandate, vetoThresholdUsdc: 1 });
    await runner.tick();
    const pending = engine.vaultStatus("vault-1").pendingVetoes![0]!;
    await engine.handle({ type: "veto", vaultId: "vault-1", proposalId: pending.proposalId });

    await runner.tick();
    await runner.tick();

    expect(records[1]).toMatchObject({ result: { kind: "vetoed" } });
    expect(records[2]).toMatchObject({ note: expect.stringMatching(/was vetoed/) });
    expect(records[2]!.result).toBeUndefined();
    expect(ports.exchange.orders).toEqual([]);
  });
});

describe("Leaderboard", () => {
  it("counts a proposal rejected on every tick of its candle once", () => {
    const rejected = (at: number, proposalId: string): RunnerRecord => ({
      at,
      vaultId: "vault-1",
      asset: "BTC",
      proposal: proposal({ proposalId }),
      result: { kind: "rejected", proposalId, rejection: { code: "leverage-over-cap", message: "over" } },
    });
    const rows = leaderboard({ roster, history: [rejected(1, "a"), rejected(2, "a"), rejected(3, "a"), rejected(4, "b")], leads: new Map(), fills: [] });

    expect(rows.find((r) => r.agentId === "momentum")).toMatchObject({ proposals: 2, rejected: 2, lastActiveAt: 4 });
  });
});
