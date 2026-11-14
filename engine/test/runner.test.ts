import { describe, expect, it } from "vitest";
import type { AgentProfile } from "../src/agents/allocator.js";
import { FundingArbAgent } from "../src/agents/funding-arb.js";
import type { LeadSelector } from "../src/agents/jev-allocator.js";
import { MeanReversionAgent } from "../src/agents/mean-reversion.js";
import { MomentumAgent } from "../src/agents/momentum.js";
import type { MarketSnapshot } from "../src/agents/types.js";
import { createEngine } from "../src/index.js";
import { createRunner, type RunnerRecord } from "../src/runner/runner.js";
import { defaultMandate, fakePorts } from "../src/testing/fakes.js";
import { chop, uptrendBreakout } from "./fixtures/candles.js";

const roster: AgentProfile[] = [
  { agentId: "momentum", regimes: ["trend"], bondUsdc: 1_000, epochReturns: [] },
  { agentId: "funding-arb", regimes: ["funding-skew"], bondUsdc: 600, epochReturns: [] },
  { agentId: "mean-reversion", regimes: ["chop"], bondUsdc: 800, epochReturns: [] },
];
const agents = [new MomentumAgent(), new FundingArbAgent(), new MeanReversionAgent()];
const neverCalled: LeadSelector = async () => {
  throw new Error("one candidate per Regime: Jev shouldn't be asked");
};

function setup(snapshot: MarketSnapshot) {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", snapshot.markPrice);
  ports.exchange.accountValueByVault.set("vault-1", 1_000);
  const engine = createEngine(ports);
  const records: RunnerRecord[] = [];
  let snap = snapshot;
  const runner = createRunner({
    engine,
    exchange: ports.exchange,
    market: { snapshot: async () => snap },
    vaults: [{ vaultId: "vault-1", asset: "BTC" }],
    roster,
    agents,
    select: neverCalled,
    log: (r) => records.push(r),
    fillDelayMs: 0,
  });
  return { ports, engine, runner, records, setSnap: (s: MarketSnapshot) => (snap = s) };
}

const trend: MarketSnapshot = { asset: "BTC", candles4h: uptrendBreakout, fundingRateHourly: 0.00001, markPrice: uptrendBreakout.at(-1)!.c };

describe("Runner tick", () => {
  it("assigns the Lead Agent for the Regime, then sends only its proposal through the engine", async () => {
    const { ports, engine, runner, records } = setup(trend);
    await runner.tick();

    expect(engine.vaultStatus("vault-1").leadAgent?.agentId).toBe("momentum");
    expect(ports.exchange.orders).toHaveLength(1);
    expect(ports.exchange.orders[0]).toMatchObject({ asset: "BTC", side: "long" });
    expect(ports.chain.commitments).toHaveLength(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      vaultId: "vault-1",
      asset: "BTC",
      regime: "trend",
      allocation: { leadAgentId: "momentum", source: "rules" },
      proposal: { agentId: "momentum", side: "long" },
      result: { kind: "executed" },
    });
  });

  it("doesn't resubmit a proposal that already executed on an earlier tick", async () => {
    const { ports, runner, records } = setup(trend);
    await runner.tick();
    await runner.tick();

    expect(ports.exchange.orders).toHaveLength(1);
    expect(records[1]).toMatchObject({ note: expect.stringMatching(/already executed/) });
  });

  it("records a tick with no proposal when the Lead Agent sees nothing to do", async () => {
    const { ports, runner, records } = setup({ ...trend, candles4h: chop, markPrice: chop.at(-1)!.c });
    await runner.tick();

    expect(records[0]).toMatchObject({ regime: "chop", allocation: { leadAgentId: "mean-reversion" } });
    expect(records[0]!.proposal).toBeUndefined();
    expect(ports.exchange.orders).toEqual([]);
  });

  it("uses the rationale writer, without changing the trade", async () => {
    const { ports, engine } = setup(trend);
    const records: RunnerRecord[] = [];
    const runner = createRunner({
      engine,
      exchange: ports.exchange,
      market: { snapshot: async () => trend },
      vaults: [{ vaultId: "vault-1", asset: "BTC" }],
      roster,
      agents,
      select: neverCalled,
      write: async () => "Gemini says BTC broke out.",
      log: (r) => records.push(r),
      fillDelayMs: 0,
    });
    await runner.tick();
    expect(records[0]!.proposal?.rationale).toBe("Gemini says BTC broke out.");
    expect(ports.exchange.orders[0]?.side).toBe("long");
  });

  it("after an executed close, feeds the fill to the engine so a Flat Vault is reported", async () => {
    const { ports, runner, setSnap } = setup(trend);
    await runner.tick(); // momentum opens long
    // Price falls through the 10-bar low: momentum closes; the fake exchange then shows no positions.
    ports.exchange.positionsByVault.set("vault-1", [{ asset: "BTC", size: 0.01, entryPrice: 70_000 }]);
    const fall = uptrendBreakout.slice(0, -1).concat([{ ...uptrendBreakout.at(-1)!, t: uptrendBreakout.at(-1)!.t + 1, c: 60_000 }]);
    setSnap({ ...trend, candles4h: fall, markPrice: 60_000 });
    const origReduce = ports.exchange.placeReduceOnly.bind(ports.exchange);
    ports.exchange.placeReduceOnly = async (o) => {
      const r = await origReduce(o);
      ports.exchange.positionsByVault.set("vault-1", []);
      return r;
    };
    await runner.tick();

    expect(ports.exchange.reduceOnlyOrders).toHaveLength(1);
    expect(ports.chain.flatReports).toEqual(["vault-1"]);
  });

  it("keeps going when one Vault fails, and logs the error", async () => {
    const { ports, engine } = setup(trend);
    const records: RunnerRecord[] = [];
    const runner = createRunner({
      engine,
      exchange: ports.exchange,
      market: { snapshot: async (asset) => (asset === "BAD" ? Promise.reject(new Error("no candles for BAD")) : trend) },
      vaults: [{ vaultId: "vault-bad", asset: "BAD" }, { vaultId: "vault-1", asset: "BTC" }],
      roster,
      agents,
      select: neverCalled,
      log: (r) => records.push(r),
      fillDelayMs: 0,
    });
    await runner.tick();
    expect(records[0]).toMatchObject({ vaultId: "vault-bad", error: "no candles for BAD" });
    expect(records[1]).toMatchObject({ vaultId: "vault-1", result: { kind: "executed" } });
  });

  it("logs the engine's rejection, e.g. an asset the Mandate doesn't allow", async () => {
    const { ports, runner, records } = setup(trend);
    ports.chain.mandates.set("vault-1", { ...defaultMandate, allowedAssets: ["ETH"] });
    await runner.tick();
    expect(records[0]).toMatchObject({ result: { kind: "rejected", rejection: { code: "asset-not-allowed" } } });
  });
});
