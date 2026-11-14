import { describe, expect, it } from "vitest";
import { createEngine, type EngineEvent, type TradeProposal } from "../src/index.js";
import { defaultMandate, fakePorts } from "../src/testing/fakes.js";

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0); // 2026-11-14 12:00 UTC

const open = (over: Partial<TradeProposal> = {}): TradeProposal => ({
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
const reduce = (over: Partial<TradeProposal> = {}) => open({ intent: "reduce", side: "long", ...over });
const tick = (oraclePrice: number, referencePrice: number, at: number, asset = "BTC"): EngineEvent => ({
  type: "price-tick",
  asset,
  oraclePrice,
  referencePrice,
  at,
});

function setup() {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", 65_000);
  ports.exchange.marks.set("ETH", 1_900);
  ports.exchange.accountValueByVault.set("vault-1", 1_000);
  let now = T0;
  const clock = { set: (t: number) => (now = t) };
  const engine = createEngine(ports, { now: () => now });
  return { ports, engine, clock };
}

describe("Blackout windows", () => {
  it("rejects opening proposals inside a blackout window", async () => {
    const { ports, engine } = setup();
    ports.chain.mandates.set("vault-1", { ...defaultMandate, blackoutWindows: [{ start: T0 - 60_000, end: T0 + 60_000 }] });

    const result = await engine.handle(open());
    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "blackout-window" } });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("allows opening proposals outside every window (end is exclusive)", async () => {
    const { ports, engine } = setup();
    ports.chain.mandates.set("vault-1", { ...defaultMandate, blackoutWindows: [{ start: T0 - 120_000, end: T0 }, { start: T0 + 1, end: T0 + 60_000 }] });

    expect((await engine.handle(open())).kind).toBe("executed");
  });

  it("still lets a Vault reduce during a blackout window", async () => {
    const { ports, engine } = setup();
    ports.chain.mandates.set("vault-1", { ...defaultMandate, blackoutWindows: [{ start: T0 - 60_000, end: T0 + 60_000 }] });

    expect((await engine.handle(reduce())).kind).toBe("executed");
  });
});

describe("Automatic Kill on the drawdown cap", () => {
  it("fires when drawdown from this month's High-Water Mark reaches the cap, and blocks new positions", async () => {
    const { ports, engine } = setup();
    await engine.handle(open()); // sees 1,000: the month's High-Water Mark
    ports.exchange.accountValueByVault.set("vault-1", 900); // -10% = the default cap

    const result = await engine.handle(open());
    expect(result).toMatchObject({ kind: "rejected", rejection: { code: "automatic-kill" } });
    expect(engine.vaultStatus("vault-1").automaticKill).toMatchObject({ trigger: "drawdown-cap" });
    expect(engine.vaultStatus("vault-1").automaticKill?.reason).toMatch(/10(\.0)?% .*cap of 10%/);
  });

  it("does not fire just under the cap", async () => {
    const { ports, engine } = setup();
    await engine.handle(open());
    ports.exchange.accountValueByVault.set("vault-1", 901);

    expect((await engine.handle(open())).kind).toBe("executed");
    expect(engine.vaultStatus("vault-1").automaticKill).toBeUndefined();
  });

  it("measures drawdown from the highest value seen, not the first", async () => {
    const { ports, engine } = setup();
    await engine.handle(open());
    ports.exchange.accountValueByVault.set("vault-1", 1_200);
    await engine.handle(open());
    ports.exchange.accountValueByVault.set("vault-1", 1_080); // -10% from 1,200, +8% from 1,000

    expect(await engine.handle(open())).toMatchObject({ kind: "rejected", rejection: { code: "automatic-kill" } });
  });

  it("stays fired for the rest of the month, even if value recovers, and resets next month", async () => {
    const { ports, engine, clock } = setup();
    await engine.handle(open());
    ports.exchange.accountValueByVault.set("vault-1", 850);
    await engine.handle(open());
    ports.exchange.accountValueByVault.set("vault-1", 1_000);

    expect(await engine.handle(open())).toMatchObject({ kind: "rejected", rejection: { code: "automatic-kill" } });

    clock.set(Date.UTC(2026, 11, 1, 0, 0, 1)); // 1 December
    expect((await engine.handle(open())).kind).toBe("executed");
    expect(engine.vaultStatus("vault-1").automaticKill).toBeUndefined();
  });

  it("leaves existing stop-losses alone and still allows reducing", async () => {
    const { ports, engine } = setup();
    await engine.handle(open());
    ports.exchange.accountValueByVault.set("vault-1", 800);
    await engine.handle(open());

    expect((await engine.handle(reduce())).kind).toBe("executed");
    expect(ports.exchange.cancelled).toEqual([]);
    expect(ports.exchange.orders).toHaveLength(1); // the first entry and its stop, untouched
  });

  it("uses the Vault's own Mandate cap", async () => {
    const { ports, engine } = setup();
    ports.chain.mandates.set("vault-1", { ...defaultMandate, drawdownCapPct: 5 });
    await engine.handle(open());
    ports.exchange.accountValueByVault.set("vault-1", 950);

    expect(await engine.handle(open())).toMatchObject({ kind: "rejected", rejection: { code: "automatic-kill" } });
  });
});

describe("Automatic Kill on oracle deviation", () => {
  it("fires once the oracle has strayed more than 2% from the reference for more than 30s", async () => {
    const { ports, engine, clock } = setup();
    await engine.handle(tick(66_400, 65_000, T0)); // +2.15%
    clock.set(T0 + 31_000);
    await engine.handle(tick(66_400, 65_000, T0 + 31_000));

    expect(await engine.handle(open())).toMatchObject({ kind: "rejected", rejection: { code: "automatic-kill" } });
    expect(engine.vaultStatus("vault-1").automaticKill).toMatchObject({ trigger: "oracle-deviation", asset: "BTC" });
    expect(ports.exchange.orders).toEqual([]);
  });

  it("does not fire on a deviation shorter than 30s", async () => {
    const { engine, clock } = setup();
    await engine.handle(tick(66_400, 65_000, T0));
    clock.set(T0 + 29_000);
    await engine.handle(tick(66_400, 65_000, T0 + 29_000));

    expect((await engine.handle(open())).kind).toBe("executed");
  });

  it("does not fire at exactly 2%, or when the deviation breaks before 30s", async () => {
    const { engine, clock } = setup();
    await engine.handle(tick(66_300, 65_000, T0)); // exactly 2%
    await engine.handle(tick(66_400, 65_000, T0 + 10_000));
    await engine.handle(tick(65_100, 65_000, T0 + 20_000)); // back in range: the 30s restarts
    await engine.handle(tick(66_400, 65_000, T0 + 25_000));
    clock.set(T0 + 50_000);
    await engine.handle(tick(66_400, 65_000, T0 + 50_000)); // 25s into the new deviation

    expect((await engine.handle(open())).kind).toBe("executed");
  });

  it("only blocks the deviating asset", async () => {
    const { engine, clock } = setup();
    await engine.handle(tick(66_400, 65_000, T0));
    clock.set(T0 + 31_000);
    await engine.handle(tick(66_400, 65_000, T0 + 31_000));

    expect((await engine.handle(open({ asset: "ETH", size: 0.1 }))).kind).toBe("executed");
  });

  it("clears once the oracle is back within 2% of the reference", async () => {
    const { engine, clock } = setup();
    await engine.handle(tick(66_400, 65_000, T0));
    await engine.handle(tick(66_400, 65_000, T0 + 31_000));
    clock.set(T0 + 40_000);
    await engine.handle(tick(65_200, 65_000, T0 + 40_000));

    expect((await engine.handle(open())).kind).toBe("executed");
  });

  it("still allows reducing while the oracle deviates", async () => {
    const { engine } = setup();
    await engine.handle(tick(60_000, 65_000, T0));
    await engine.handle(tick(60_000, 65_000, T0 + 31_000));

    expect((await engine.handle(reduce())).kind).toBe("executed");
  });
});

describe("Flat reporting for Mandate Version effectiveness", () => {
  it("reports the Vault Flat when a fill leaves it with no open positions", async () => {
    const { ports, engine } = setup();
    ports.exchange.positionsByVault.set("vault-1", []);
    await engine.handle({ type: "fill", vaultId: "vault-1", orderId: "1", price: 65_000, size: 0.01, at: T0 });

    expect(ports.chain.flatReports).toEqual(["vault-1"]);
  });

  it("does not report Flat while a position is open", async () => {
    const { ports, engine } = setup();
    ports.exchange.positionsByVault.set("vault-1", [{ asset: "BTC", size: 0.01, entryPrice: 65_000 }]);
    await engine.handle({ type: "fill", vaultId: "vault-1", orderId: "1", price: 65_000, size: 0.01, at: T0 });

    expect(ports.chain.flatReports).toEqual([]);
  });

  it("checks every proposal against the Mandate Version current at that moment", async () => {
    const { ports, engine } = setup();
    expect((await engine.handle(open({ leverage: 3 }))).kind).toBe("executed");
    // A tighter version takes effect immediately on the chain side; the engine reads it per proposal.
    ports.chain.mandates.set("vault-1", { ...defaultMandate, version: 2, leverageCap: 2 });
    expect(await engine.handle(open({ leverage: 3 }))).toMatchObject({ kind: "rejected", rejection: { code: "leverage-over-cap" } });
  });
});
