import { describe, expect, it } from "vitest";
import { createEngine, type TradeProposal } from "../src/index.js";
import { defaultMandate, fakePorts } from "../src/testing/fakes.js";

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
  ports.exchange.marks.set("ETH", 1_900);
  const engine = createEngine(ports);
  return { ports, engine };
}

describe("Mandate Check on a Trade Proposal", () => {
  it("rejects leverage over the cap and sends no order", async () => {
    const { ports, engine } = setup();
    const result = await engine.handle(proposal({ leverage: defaultMandate.leverageCap + 1 }));

    expect(result).toMatchObject({ kind: "rejected", proposalId: "p-1", rejection: { code: "leverage-over-cap" } });
    expect(ports.exchange.orders).toEqual([]);
    expect(ports.chain.commitments).toEqual([]);
  });

  it("accepts leverage exactly at the cap", async () => {
    const { ports, engine } = setup();
    const result = await engine.handle(proposal({ leverage: defaultMandate.leverageCap }));

    expect(result.kind).toBe("executed");
    expect(ports.exchange.orders).toHaveLength(1);
  });

  it("rejects an asset the Mandate doesn't allow and sends no order", async () => {
    const { ports, engine } = setup();
    ports.exchange.marks.set("DOGE", 0.1);
    const result = await engine.handle(proposal({ asset: "DOGE", size: 500 }));

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "asset-not-allowed" } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("rejects every proposal while the Mandate's kill flag is set", async () => {
    const { ports, engine } = setup();
    ports.chain.mandates.set("vault-1", { ...defaultMandate, killFlag: true });
    const result = await engine.handle(proposal());

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "kill-flag" } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("rejects an opening proposal from an agent below its Bond Minimum", async () => {
    const { ports, engine } = setup();
    ports.chain.belowBondMinimum.add("momentum");
    const result = await engine.handle(proposal());

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "below-bond-minimum" } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("lets an agent below its Bond Minimum reduce, without a new stop-loss", async () => {
    const { ports, engine } = setup();
    ports.chain.belowBondMinimum.add("momentum");
    const result = await engine.handle(proposal({ intent: "reduce", side: "short" }));

    expect(result.kind).toBe("executed");
    expect(ports.exchange.orders).toEqual([]);
    expect(ports.exchange.reduceOnlyOrders).toHaveLength(1);
  });

  it("rejects the proposal when the Mandate can't be read or verified", async () => {
    const { ports, engine } = setup();
    ports.chain.failMandateReads = "Mandate JSON does not match its onchain hash";
    const result = await engine.handle(proposal());

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "mandate-unavailable" } });
    if (result.kind === "rejected") expect(result.rejection.message).toMatch(/does not match/);
    expect(ports.exchange.orders).toEqual([]);
  });

  it("rejects an order below Hyperliquid's 10 USDC minimum before committing anything", async () => {
    const { ports, engine } = setup();
    const result = await engine.handle(proposal({ size: 10.05 / 65_000 })); // 10.05 USDC: too close once size is rounded down

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "below-minimum-order" } });
    expect(ports.chain.commitments).toEqual([]);
    expect(ports.exchange.orders).toEqual([]);
  });

  it("checks the minimum on the size the exchange will send, after rounding to its size step", async () => {
    // Seen on testnet: 0.00015976 BTC at 65,246 is 10.42 USDC, but BTC sizes step by 0.00001, so the order went out
    // as 0.00015 BTC (9.79 USDC) and Hyperliquid refused it after the Decision Commitment was already onchain.
    const { ports, engine } = setup();
    ports.exchange.marks.set("BTC", 65_246);
    ports.exchange.sizeSteps.set("BTC", 0.00001);
    const result = await engine.handle(proposal({ size: 0.00015975958679459275 }));

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "below-minimum-order" } });
    if (result.kind === "rejected") expect(result.rejection.message).toMatch(/9\.79/);
    expect(ports.chain.commitments).toEqual([]);
    expect(ports.exchange.orders).toEqual([]);
  });

  it("rejects malformed proposals", async () => {
    const { ports, engine } = setup();
    for (const bad of [{ size: 0 }, { size: -1 }, { leverage: 0 }, { size: Number.NaN }]) {
      const result = await engine.handle(proposal(bad));
      expect(result).toMatchObject({ kind: "rejected", rejection: { code: "invalid-proposal" } });
    }
    expect(ports.exchange.orders).toEqual([]);
  });

  it("reports the rejection reason back to the proposer so it can re-plan", async () => {
    const { engine } = setup();
    const result = await engine.handle(proposal({ leverage: 9 }));

    if (result.kind !== "rejected") throw new Error("expected a rejection");
    expect(result.rejection.message).toMatch(/9x.*cap of 3x/);
    // The agent re-plans inside the limit and goes through.
    const retry = await engine.handle(proposal({ proposalId: "p-2", leverage: 3 }));
    expect(retry.kind).toBe("executed");
  });
});

describe("Decision Commitment before the order", () => {
  it("sends no order when the Decision Commitment fails", async () => {
    const { ports, engine } = setup();
    ports.chain.failCommitments = true;
    const result = await engine.handle(proposal());

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "commitment-failed" } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("reports an exchange rejection after the commitment instead of throwing", async () => {
    const { ports, engine } = setup();
    ports.exchange.rejectOrdersWith = "Price too far from oracle asset=3";
    const result = await engine.handle(proposal());

    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "order-failed" } });
    if (result.kind !== "rejected") return;
    expect(result.rejection.message).toMatch(/too far from oracle/);
    // The decision was still committed: replay shows it was decided and then failed at the exchange.
    expect(ports.chain.commitments).toHaveLength(1);
  });

  it("commits the decision onchain before the order is sent", async () => {
    const { ports, engine } = setup();
    await engine.handle(proposal());

    const order = ports.journal.indexOf("exchange.placeOrderWithStopLoss");
    const commit = ports.journal.indexOf("chain.commitDecision");
    expect(commit).toBeGreaterThanOrEqual(0);
    expect(commit).toBeLessThan(order);
  });

  it("commits a hash that matches the returned decision record", async () => {
    const { ports, engine } = setup();
    const result = await engine.handle(proposal());

    if (result.kind !== "executed") throw new Error("expected execution");
    expect(ports.chain.commitments).toEqual([{ vaultId: "vault-1", agentId: "momentum", decisionHash: result.decisionHash }]);
    expect(result.decisionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.decision.proposal.proposalId).toBe("p-1");
    expect(result.decision.mandateVersion).toBe(defaultMandate.version);
  });
});

describe("Every entry carries a grouped reduce-only stop-loss", () => {
  it("places a long's stop below the mark at the Mandate's stop-loss %", async () => {
    const { ports, engine } = setup();
    await engine.handle(proposal({ side: "long" }));

    const [order] = ports.exchange.orders;
    expect(order?.stopLoss.triggerPrice).toBeCloseTo(65_000 * (1 - defaultMandate.stopLossPct / 100));
    expect(order?.limitPrice).toBeGreaterThan(65_000);
  });

  it("places a short's stop above the mark", async () => {
    const { ports, engine } = setup();
    await engine.handle(proposal({ side: "short", asset: "ETH", size: 0.1 }));

    const [order] = ports.exchange.orders;
    expect(order?.stopLoss.triggerPrice).toBeCloseTo(1_900 * (1 + defaultMandate.stopLossPct / 100));
    expect(order?.limitPrice).toBeLessThan(1_900);
  });

  it("uses the Vault's current Mandate Version, not the default", async () => {
    const { ports, engine } = setup();
    ports.chain.mandates.set("vault-1", { ...defaultMandate, version: 4, stopLossPct: 5 });
    await engine.handle(proposal());

    expect(ports.exchange.orders[0]?.stopLoss.triggerPrice).toBeCloseTo(65_000 * 0.95);
  });

  it("sets the proposal's leverage before the order", async () => {
    const { ports, engine } = setup();
    await engine.handle(proposal({ leverage: 3 }));

    expect(ports.exchange.leverage).toEqual([{ vaultId: "vault-1", asset: "BTC", leverage: 3 }]);
    expect(ports.journal.indexOf("exchange.setLeverage")).toBeLessThan(ports.journal.indexOf("exchange.placeOrderWithStopLoss"));
  });

  it("tags entry and stop with distinct cloids and logs the stop with its placement time", async () => {
    const { ports, engine } = setup();
    const result = await engine.handle(proposal());

    if (result.kind !== "executed") throw new Error("expected execution");
    const [order] = ports.exchange.orders;
    expect(order?.entryCloid).toMatch(/^0x[0-9a-f]{32}$/);
    expect(order?.stopLoss.cloid).toMatch(/^0x[0-9a-f]{32}$/);
    expect(order?.entryCloid).not.toBe(order?.stopLoss.cloid);
    expect(result.stopLoss).toEqual({
      cloid: order?.stopLoss.cloid,
      triggerPrice: order?.stopLoss.triggerPrice,
      placedAt: expect.any(Number),
    });
  });

  it("never sends an opening order without a stop-loss", async () => {
    const { ports, engine } = setup();
    for (const [i, side] of (["long", "short", "long"] as const).entries()) {
      await engine.handle(proposal({ proposalId: `p-${i}`, side }));
    }
    expect(ports.exchange.orders).toHaveLength(3);
    for (const o of ports.exchange.orders) expect(o.stopLoss.triggerPrice).toBeGreaterThan(0);
  });
});
