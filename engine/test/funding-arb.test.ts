import { describe, expect, it } from "vitest";
import { FundingArbAgent } from "../src/agents/funding-arb.js";
import type { MarketSnapshot } from "../src/agents/types.js";
import { chop } from "./fixtures/candles.js";

// Fixed funding fixtures (hourly rates). 0.0005/h = 0.05%/h, the funding-skew threshold.
const LONGS_PAY = 0.0008;
const SHORTS_PAY = -0.0008;
const STEADY_LONGS_PAY = [0.0006, 0.0007, 0.0007, 0.0008, 0.0008, 0.0009, 0.0008, 0.0008];
const STEADY_SHORTS_PAY = STEADY_LONGS_PAY.map((f) => -f);
const ONE_HOUR_SPIKE = [0.00005, 0.0001, 0.00002, 0, 0.00008, 0.00003, 0.0001, 0.0008];

const snap = (fundingRateHourly: number, history?: number[]): MarketSnapshot => ({
  asset: "ETH",
  candles4h: chop,
  fundingRateHourly,
  ...(history ? { fundingHistoryHourly: history } : {}),
  markPrice: 1_900,
});
const flat = { vaultId: "vault-1", accountValue: 1_000, position: 0 };
const agent = new FundingArbAgent();

describe("Funding-arb agent on fixed funding fixtures", () => {
  it("only declares the funding-skew Regime", () => {
    expect(agent.regimes).toEqual(["funding-skew"]);
  });

  it("goes short when longs pay a steady, large funding rate (it collects the funding)", () => {
    const p = agent.decide(snap(LONGS_PAY, STEADY_LONGS_PAY), flat);
    expect(p).toMatchObject({ agentId: "funding-arb", side: "short", intent: "open", leverage: 1 });
    expect(p!.size * 1_900).toBeCloseTo(1_000 * 0.3, 0); // 30% of value, unlevered
  });

  it("goes long when shorts pay", () => {
    expect(agent.decide(snap(SHORTS_PAY, STEADY_SHORTS_PAY), flat)).toMatchObject({ side: "long", intent: "open" });
  });

  it("ignores funding below the skew threshold", () => {
    expect(agent.decide(snap(0.0003, Array(8).fill(0.0003)), flat)).toBeUndefined();
  });

  it("ignores a one-hour spike that the recent history doesn't back up", () => {
    expect(agent.decide(snap(0.0008, ONE_HOUR_SPIKE), flat)).toBeUndefined();
  });

  it("enters on the current rate alone when no history is given", () => {
    expect(agent.decide(snap(LONGS_PAY), flat)).toMatchObject({ side: "short" });
  });

  it("scales confidence with the size of the funding rate, capped", () => {
    const low = agent.decide(snap(0.0006), flat)!.confidence;
    const high = agent.decide(snap(0.002), flat)!.confidence;
    expect(low).toBeGreaterThanOrEqual(0.5);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(0.9);
  });

  it("doesn't add to a position already on the collecting side", () => {
    expect(agent.decide(snap(LONGS_PAY), { ...flat, position: -0.1 })).toBeUndefined();
  });

  it("closes when funding flips against the position", () => {
    // Short (collects when longs pay); now shorts pay.
    expect(agent.decide(snap(SHORTS_PAY), { ...flat, position: -0.1 })).toMatchObject({ intent: "close", side: "short", size: 0.1 });
  });

  it("closes when funding fades to almost nothing", () => {
    expect(agent.decide(snap(0.00005), { ...flat, position: -0.1 })).toMatchObject({ intent: "close", side: "short" });
    expect(agent.decide(snap(-0.00005), { ...flat, position: 0.1 })).toMatchObject({ intent: "close", side: "long" });
  });

  it("holds while funding is still paying its side, even below the entry threshold", () => {
    expect(agent.decide(snap(0.0002), { ...flat, position: -0.1 })).toBeUndefined();
  });

  it("is deterministic, and its rationale says the position is unhedged", () => {
    const a = agent.decide(snap(LONGS_PAY, STEADY_LONGS_PAY), flat);
    expect(a).toEqual(agent.decide(snap(LONGS_PAY, STEADY_LONGS_PAY), flat));
    expect(a!.rationale).toMatch(/longs pay 0\.08%\/h/);
    expect(a!.rationale).toMatch(/unhedged/);
  });

  it("explains without changing the trade", async () => {
    const p = agent.decide(snap(LONGS_PAY), flat)!;
    const e = await agent.explain(p, async () => "Gemini text");
    expect({ ...e, rationale: "" }).toEqual({ ...p, rationale: "" });
    expect(e.rationale).toBe("Gemini text");
  });
});
