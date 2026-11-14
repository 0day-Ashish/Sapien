import { describe, expect, it } from "vitest";
import { createEngine, type TradeProposal } from "../src/index.js";
import { isInfrastructureFailure, overshootUsdc, type StopRecord, stopExposureUsdc } from "../src/overshoot.js";
import type { Cloid } from "../src/ports.js";
import { fakePorts } from "../src/testing/fakes.js";

const stop: StopRecord = {
  vaultId: "vault-1",
  agentId: "momentum",
  asset: "BTC",
  side: "long",
  size: 0.01,
  triggerPrice: 63_700,
  cloid: "0xstop" as Cloid,
  placedAt: 1_000,
};

describe("Overshoot math", () => {
  it("is |fill - trigger| x size past the trigger, fees and funding excluded", () => {
    expect(overshootUsdc("long", 63_700, 63_200, 0.01)).toBeCloseTo(5);
    expect(overshootUsdc("short", 2_000, 2_010, 0.5)).toBeCloseTo(5);
  });
  it("is zero at or better than the trigger", () => {
    expect(overshootUsdc("long", 63_700, 63_700, 0.01)).toBe(0);
    expect(overshootUsdc("long", 63_700, 63_800, 0.01)).toBe(0);
    expect(overshootUsdc("short", 2_000, 1_990, 0.5)).toBe(0);
  });
  it("sums open stop-loss exposure at the triggers", () => {
    expect(stopExposureUsdc([stop, { ...stop, triggerPrice: 2_000, size: 0.5 }])).toBeCloseTo(637 + 1_000);
  });
});

describe("Infrastructure Failure classification", () => {
  it("is a failure when no stop was logged", () => {
    expect(isInfrastructureFailure(undefined, undefined, 5_000)).toBe(true);
  });
  it("is a failure when the stop was placed only after the trigger was crossed", () => {
    expect(isInfrastructureFailure({ ...stop, placedAt: 6_000 }, "resting", 5_000)).toBe(true);
  });
  it.each(["cancelled", "rejected", "waiting-for-fill", "unknown"] as const)("is a failure when the stop was %s", (state) => {
    expect(isInfrastructureFailure(stop, state, 5_000)).toBe(true);
  });
  it.each(["resting", "triggered", "filled"] as const)("is a market gap when the stop was %s", (state) => {
    expect(isInfrastructureFailure(stop, state, 5_000)).toBe(false);
  });
});

const open = (over: Partial<TradeProposal> = {}): TradeProposal => ({
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

/** An engine with one open long BTC position (mark 65,000, 2% stop: trigger 63,700) and its stop resting. */
async function withOpenPosition() {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", 65_000);
  ports.exchange.accountValueByVault.set("vault-1", 1_000);
  const engine = createEngine(ports);
  const r = await engine.handle(open());
  if (r.kind !== "executed" || !r.stopLoss) throw new Error("expected an executed open");
  ports.exchange.positionsByVault.set("vault-1", []); // the fills below close it
  return { ports, engine, stop: r.stopLoss };
}

describe("Overshoot claims from fills", () => {
  it("claims a market gap when the stop-loss fills past its trigger", async () => {
    const { ports, engine, stop } = await withOpenPosition();
    expect(stop.triggerPrice).toBeCloseTo(63_700);
    ports.exchange.orderStates.set(stop.cloid, "filled");

    await engine.handle({ type: "fill", vaultId: "vault-1", cloid: stop.cloid, orderId: "9", price: 63_200, size: 0.01, at: Date.now() });

    expect(ports.chain.claims).toHaveLength(1);
    const claim = ports.chain.claims[0]!;
    expect(claim).toMatchObject({
      vaultId: "vault-1",
      agentId: "momentum",
      positionId: stop.cloid,
      fillPrice: 63_200,
      size: 0.01,
      infrastructureFailure: false,
      vaultValueUsdc: 1_000,
    });
    expect(claim.triggerPrice).toBeCloseTo(63_700);
    const evidence = JSON.parse(claim.evidenceRef);
    expect(evidence.stop).toMatchObject({ cloid: stop.cloid, stateOnHyperCore: "filled" });
    expect(evidence.fill).toMatchObject({ orderId: "9", price: 63_200 });
    expect(evidence.overshootUsdc).toBeCloseTo(5);
    expect(ports.chain.flatReports).toEqual(["vault-1"]);
  });

  it("makes no claim when the stop fills at or better than its trigger", async () => {
    const { ports, engine, stop } = await withOpenPosition();
    await engine.handle({ type: "fill", vaultId: "vault-1", cloid: stop.cloid, orderId: "9", price: 63_750, size: 0.01, at: Date.now() });
    expect(ports.chain.claims).toEqual([]);
  });

  it("claims an Infrastructure Failure when a fill it didn't place closes past the trigger and the stop wasn't resting", async () => {
    const { ports, engine, stop } = await withOpenPosition();
    ports.exchange.orderStates.set(stop.cloid, "cancelled");

    await engine.handle({ type: "fill", vaultId: "vault-1", orderId: "liq", asset: "BTC", price: 63_000, size: 0.01, at: Date.now() });

    expect(ports.chain.claims).toHaveLength(1);
    expect(ports.chain.claims[0]).toMatchObject({ positionId: stop.cloid, infrastructureFailure: true, fillPrice: 63_000 });
  });

  it("makes no claim for such a fill while the stop was resting", async () => {
    const { ports, engine } = await withOpenPosition();
    await engine.handle({ type: "fill", vaultId: "vault-1", orderId: "liq", asset: "BTC", price: 63_000, size: 0.01, at: Date.now() });
    expect(ports.chain.claims).toEqual([]);
  });

  it("makes no claim for the engine's own close, even past the trigger", async () => {
    const { ports, engine, stop } = await withOpenPosition();
    ports.exchange.orderStates.set(stop.cloid, "cancelled");
    const close = await engine.handle(open({ proposalId: "p-2", intent: "close" }));
    if (close.kind !== "executed") throw new Error("expected the close to execute");
    await engine.handle({ type: "fill", vaultId: "vault-1", cloid: close.order.entryCloid, orderId: "c", asset: "BTC", price: 63_000, size: 0.01, at: Date.now() });
    expect(ports.chain.claims).toEqual([]);
  });

  it("claims each position once", async () => {
    const { ports, engine, stop } = await withOpenPosition();
    const fill = { type: "fill", vaultId: "vault-1", cloid: stop.cloid, orderId: "9", price: 63_200, size: 0.01, at: Date.now() } as const;
    await engine.handle(fill);
    await engine.handle(fill);
    expect(ports.chain.claims).toHaveLength(1);
  });

  it("reports open stop-loss exposure for the Coverage Ratio, and drops it once Flat", async () => {
    const { ports, engine, stop } = await withOpenPosition();
    expect(ports.chain.exposures.at(-1)).toBeCloseTo(637);
    await engine.handle({ type: "fill", vaultId: "vault-1", cloid: stop.cloid, orderId: "9", price: 63_750, size: 0.01, at: Date.now() });
    expect(ports.chain.exposures.at(-1)).toBe(0);
  });
});
