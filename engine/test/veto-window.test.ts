import { describe, expect, it } from "vitest";
import { createEngine, type TradeProposal } from "../src/index.js";
import { defaultMandate, fakePorts } from "../src/testing/fakes.js";

// 0.01 BTC at 65,000 = 650 USDC, above a 500 USDC veto threshold.
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
  confidence: 0.72,
  rationale: "breakout above the 4h range",
  ...over,
});

function setup() {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", 65_000);
  ports.chain.mandates.set("vault-1", { ...defaultMandate, vetoThresholdUsdc: 500 });
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const engine = createEngine(ports, { now: clock.now });
  const end = { type: "veto-window-end", vaultId: "vault-1", proposalId: "p-1" } as const;
  return { ports, engine, clock, end };
}

describe("Veto Window", () => {
  it("holds a trade above the veto threshold for 60s, with nothing committed or sent", async () => {
    const { ports, engine, clock } = setup();
    const result = await engine.handle(proposal());

    expect(result).toMatchObject({ kind: "veto-window", proposalId: "p-1", vaultId: "vault-1", expiresAt: clock.now() + 60_000 });
    expect(ports.chain.commitments).toEqual([]);
    expect(ports.exchange.orders).toEqual([]);
    expect(engine.vaultStatus("vault-1").pendingVetoes).toEqual([
      expect.objectContaining({ proposalId: "p-1", asset: "BTC", side: "long", notional: 650, markPrice: 65_000, rationale: "breakout above the 4h range" }),
    ]);
  });

  it("lets trades at or under the threshold, and reducing trades, go straight through", async () => {
    const { ports, engine } = setup();
    expect(await engine.handle(proposal({ proposalId: "small", size: 0.005 }))).toMatchObject({ kind: "executed" });
    expect(await engine.handle(proposal({ proposalId: "reduce", intent: "reduce", side: "long" }))).toMatchObject({ kind: "executed" });
    expect(ports.chain.commitments).toHaveLength(2);
  });

  it("veto cancels the trade: never committed, never sent, and the window can't end later", async () => {
    const { ports, engine, clock, end } = setup();
    await engine.handle(proposal());

    expect(await engine.handle({ type: "veto", vaultId: "vault-1", proposalId: "p-1" })).toEqual({ kind: "vetoed", proposalId: "p-1" });
    expect(engine.vaultStatus("vault-1").pendingVetoes).toBeUndefined();

    clock.advance(60_000);
    expect(await engine.handle(end)).toEqual({ kind: "ignored" });
    expect(ports.chain.commitments).toEqual([]);
    expect(ports.exchange.orders).toEqual([]);
  });

  it("ignores a veto for another Vault or an unknown proposal", async () => {
    const { engine } = setup();
    await engine.handle(proposal());
    expect(await engine.handle({ type: "veto", vaultId: "vault-2", proposalId: "p-1" })).toEqual({ kind: "ignored" });
    expect(await engine.handle({ type: "veto", vaultId: "vault-1", proposalId: "nope" })).toEqual({ kind: "ignored" });
    expect(engine.vaultStatus("vault-1").pendingVetoes).toHaveLength(1);
  });

  it("at expiry with a passing check, commits then sends with the slippage cap", async () => {
    const { ports, engine, clock, end } = setup();
    await engine.handle(proposal());
    clock.advance(60_000);
    ports.exchange.marks.set("BTC", 65_300); // +0.46%, inside the 1% cap

    const result = await engine.handle(end);

    expect(result).toMatchObject({ kind: "executed", proposalId: "p-1" });
    // Committed first, then the Vault is marked not-Flat onchain, and only then is the order sent.
    expect(ports.journal).toEqual(["chain.commitDecision", "chain.reportNotFlat", "exchange.setLeverage", "exchange.placeOrderWithStopLoss"]);
    expect(ports.exchange.orders[0]!.limitPrice).toBeCloseTo(65_300 * 1.01);
    expect(engine.vaultStatus("vault-1").pendingVetoes).toBeUndefined();
  });

  it("doesn't end the window early", async () => {
    const { ports, engine, clock, end } = setup();
    await engine.handle(proposal());
    clock.advance(59_999);
    expect(await engine.handle(end)).toMatchObject({ kind: "veto-window" });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("drops the trade when the price moved past the slippage cap during the window", async () => {
    const { ports, engine, clock, end } = setup();
    await engine.handle(proposal());
    clock.advance(60_000);
    ports.exchange.marks.set("BTC", 64_000); // -1.54%

    expect(await engine.handle(end)).toMatchObject({ kind: "rejected", rejection: { code: "price-moved" } });
    expect(ports.chain.commitments).toEqual([]);
    expect(ports.exchange.orders).toEqual([]);
  });

  it("drops the trade when the Mandate Check fails again at expiry", async () => {
    const { ports, engine, clock, end } = setup();
    await engine.handle(proposal());
    ports.chain.mandates.set("vault-1", { ...defaultMandate, vetoThresholdUsdc: 500, version: 2, leverageCap: 1 });
    clock.advance(60_000);

    expect(await engine.handle(end)).toMatchObject({ kind: "rejected", rejection: { code: "leverage-over-cap" } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("doesn't restart the window when the agent proposes the same trade again", async () => {
    const { engine, clock } = setup();
    const first = await engine.handle(proposal());
    clock.advance(30_000);
    const again = await engine.handle(proposal());
    expect(again).toMatchObject({ kind: "veto-window", expiresAt: (first as { expiresAt: number }).expiresAt });
    expect(engine.vaultStatus("vault-1").pendingVetoes).toHaveLength(1);
  });
});
