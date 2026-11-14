import { describe, expect, it } from "vitest";
import { MeanReversionAgent, zScore } from "../src/agents/mean-reversion.js";
import type { Candle, MarketSnapshot } from "../src/agents/types.js";
import { chop } from "./fixtures/candles.js";

// Fixed fixtures: the chop series (±1% around 60k) with its last close replaced.
const withLastClose = (c: number): Candle[] => [...chop.slice(0, -1), { ...chop.at(-1)!, c, l: Math.min(chop.at(-1)!.l, c), h: Math.max(chop.at(-1)!.h, c) }];
const stretchedDown = withLastClose(60_000 * 0.975); // well below the band
const stretchedUp = withLastClose(60_000 * 1.025);
const backToMean = withLastClose(60_000);

const snap = (candles4h: Candle[]): MarketSnapshot => ({ asset: "SOL", candles4h, fundingRateHourly: 0.00001, markPrice: candles4h.at(-1)!.c });
const flat = { vaultId: "vault-1", accountValue: 1_000, position: 0 };
const agent = new MeanReversionAgent();

describe("Mean-reversion agent on fixed candle fixtures", () => {
  it("only declares the chop Regime", () => {
    expect(agent.regimes).toEqual(["chop"]);
  });

  it("measures the stretch as a z-score against the 20-bar mean", () => {
    expect(zScore(stretchedDown.map((c) => c.c))).toBeLessThan(-2);
    expect(zScore(stretchedUp.map((c) => c.c))).toBeGreaterThan(2);
    expect(Math.abs(zScore(backToMean.map((c) => c.c)))).toBeLessThan(0.5);
  });

  it("buys a stretch below the band, betting on a snap back", () => {
    const p = agent.decide(snap(stretchedDown), flat);
    expect(p).toMatchObject({ agentId: "mean-reversion", side: "long", intent: "open", leverage: 2 });
    expect(p!.size * stretchedDown.at(-1)!.c).toBeCloseTo(1_000 * 0.2 * 2, 0);
  });

  it("sells a stretch above the band", () => {
    expect(agent.decide(snap(stretchedUp), flat)).toMatchObject({ side: "short", intent: "open" });
  });

  it("does nothing inside the band", () => {
    expect(agent.decide(snap(chop), flat)).toBeUndefined();
    expect(agent.decide(snap(backToMean), flat)).toBeUndefined();
  });

  it("closes once price has reverted to the mean", () => {
    expect(agent.decide(snap(backToMean), { ...flat, position: 0.01 })).toMatchObject({ intent: "close", side: "long", size: 0.01 });
    expect(agent.decide(snap(backToMean), { ...flat, position: -0.01 })).toMatchObject({ intent: "close", side: "short", size: 0.01 });
  });

  it("holds while the stretch persists, and never adds", () => {
    expect(agent.decide(snap(stretchedDown), { ...flat, position: 0.01 })).toBeUndefined();
  });

  it("gets more confident the further the stretch, capped", () => {
    const mild = agent.decide(snap(stretchedDown), flat)!.confidence;
    const extreme = agent.decide(snap(withLastClose(60_000 * 0.95)), flat)!.confidence;
    expect(mild).toBeGreaterThanOrEqual(0.5);
    expect(extreme).toBeGreaterThan(mild);
    expect(extreme).toBeLessThanOrEqual(0.85);
  });

  it("is deterministic and explains without changing the trade", async () => {
    const p = agent.decide(snap(stretchedDown), flat)!;
    expect(p).toEqual(agent.decide(snap(stretchedDown), flat));
    expect(p.rationale).toMatch(/below its 20-bar average/);
    const e = await agent.explain(p, async () => "Gemini text");
    expect({ ...e, rationale: "" }).toEqual({ ...p, rationale: "" });
  });
});
