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
  ports.exchange.marks.set("ETH", 2_000);
  // A long BTC and a short ETH are open.
  ports.exchange.positionsByVault.set("vault-1", [
    { asset: "BTC", size: 0.02, entryPrice: 64_000 },
    { asset: "ETH", size: -0.5, entryPrice: 2_100 },
  ]);
  // Closing orders fill at once, as an IOC on testnet does.
  const place = ports.exchange.placeReduceOnly.bind(ports.exchange);
  ports.exchange.placeReduceOnly = async (o) => {
    const placed = await place(o);
    const left = (ports.exchange.positionsByVault.get(o.vaultId) ?? []).filter((p) => p.asset !== o.asset);
    ports.exchange.positionsByVault.set(o.vaultId, left);
    return placed;
  };
  const killFlag = (version = 2) => ports.chain.mandates.set("vault-1", { ...defaultMandate, version, killFlag: true });
  return { ports, engine: createEngine(ports), killFlag };
}

describe("Kill Switch", () => {
  it("closes every position with a reduce-only order at its full size, and reports the Vault Flat", async () => {
    const { ports, engine, killFlag } = setup();
    killFlag();

    const result = await engine.handle({ type: "kill-switch", vaultId: "vault-1" });

    expect(result).toMatchObject({
      kind: "killed",
      flat: true,
      closes: [
        { asset: "BTC", side: "long", size: 0.02 },
        { asset: "ETH", side: "short", size: 0.5 },
      ],
    });
    // A long closes by selling below the mark; a short by buying above it.
    expect(ports.exchange.reduceOnlyOrders.map((o) => [o.asset, o.side, o.size, o.limitPrice])).toEqual([
      ["BTC", "long", 0.02, 65_000 * 0.95],
      ["ETH", "short", 0.5, 2_000 * 1.05],
    ]);
    expect(ports.exchange.orders).toEqual([]);
    expect(ports.chain.flatReports).toEqual(["vault-1"]);
  });

  it("then rejects every further Trade Proposal, reducing ones included", async () => {
    const { engine, killFlag } = setup();
    killFlag();
    await engine.handle({ type: "kill-switch", vaultId: "vault-1" });

    expect(await engine.handle(proposal())).toMatchObject({ kind: "rejected", rejection: { code: "kill-switch" } });
    expect(await engine.handle(proposal({ proposalId: "p-2", intent: "close" }))).toMatchObject({ kind: "rejected", rejection: { code: "kill-switch" } });
  });

  it("is refused, with nothing sent, until the kill flag is recorded onchain", async () => {
    const { ports, engine } = setup();

    const result = await engine.handle({ type: "kill-switch", vaultId: "vault-1" });

    expect(result).toMatchObject({ kind: "kill-refused", vaultId: "vault-1" });
    expect(ports.exchange.reduceOnlyOrders).toEqual([]);
    expect(ports.chain.flatReports).toEqual([]);
    expect(await engine.handle(proposal({ size: 0.001 }))).toMatchObject({ kind: "executed" });
  });

  it("drops trades waiting in their Veto Window", async () => {
    const { ports, engine, killFlag } = setup();
    ports.chain.mandates.set("vault-1", { ...defaultMandate, vetoThresholdUsdc: 500 });
    expect(await engine.handle(proposal())).toMatchObject({ kind: "veto-window" });
    killFlag();

    expect(await engine.handle({ type: "kill-switch", vaultId: "vault-1" })).toMatchObject({ kind: "killed", vetoed: ["p-1"] });
    expect(engine.vaultStatus("vault-1").pendingVetoes).toBeUndefined();
    expect(await engine.handle({ type: "veto-window-end", vaultId: "vault-1", proposalId: "p-1" })).toEqual({ kind: "ignored" });
  });

  it("unfreezes once a later Mandate Version clears the kill flag", async () => {
    const { ports, engine, killFlag } = setup();
    killFlag(2);
    await engine.handle({ type: "kill-switch", vaultId: "vault-1" });

    ports.chain.mandates.set("vault-1", { ...defaultMandate, version: 3, killFlag: false });
    expect(await engine.handle(proposal({ size: 0.001 }))).toMatchObject({ kind: "executed" });
  });
});
