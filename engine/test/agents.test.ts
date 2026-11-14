import { describe, expect, it } from "vitest";
import { classifyRegime } from "../src/agents/regime.js";
import { MomentumAgent } from "../src/agents/momentum.js";
import type { MarketSnapshot } from "../src/agents/types.js";
import { chop, downtrendBreakdown, highVolatility, uptrendBreakout, uptrendNoBreakout } from "./fixtures/candles.js";

const snap = (candles: MarketSnapshot["candles4h"], over: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  asset: "BTC",
  candles4h: candles,
  fundingRateHourly: 0.00001,
  markPrice: candles.at(-1)!.c,
  ...over,
});

describe("Regime classification on fixed 4h candles", () => {
  it("classifies a steady climb as trend", () => {
    expect(classifyRegime(snap(uptrendBreakout)).regime).toBe("trend");
  });

  it("classifies a steady fall as trend", () => {
    expect(classifyRegime(snap(downtrendBreakdown)).regime).toBe("trend");
  });

  it("classifies sideways oscillation as chop", () => {
    expect(classifyRegime(snap(chop)).regime).toBe("chop");
  });

  it("classifies ±5% bar-to-bar swings as high-volatility", () => {
    expect(classifyRegime(snap(highVolatility)).regime).toBe("high-volatility");
  });

  it("classifies a large funding rate as funding-skew", () => {
    expect(classifyRegime(snap(chop, { fundingRateHourly: 0.0006 })).regime).toBe("funding-skew");
    expect(classifyRegime(snap(chop, { fundingRateHourly: -0.0006 })).regime).toBe("funding-skew");
  });

  it("puts high volatility ahead of funding skew (risk first)", () => {
    expect(classifyRegime(snap(highVolatility, { fundingRateHourly: 0.001 })).regime).toBe("high-volatility");
  });

  it("is deterministic and reports the metrics it used", () => {
    const a = classifyRegime(snap(uptrendBreakout));
    const b = classifyRegime(snap(uptrendBreakout));
    expect(a).toEqual(b);
    expect(a.metrics.trendStrength).toBeGreaterThan(0.35);
    expect(a.metrics.realizedVol).toBeLessThan(0.025);
  });

  it("refuses to classify on too few candles", () => {
    expect(() => classifyRegime(snap(chop.slice(0, 5)))).toThrow(/at least/);
  });
});

describe("Momentum agent", () => {
  const agent = new MomentumAgent();
  const ctx = { vaultId: "vault-1", accountValue: 1_000, position: 0 };

  it("only declares the trend Regime", () => {
    expect(agent.regimes).toEqual(["trend"]);
  });

  it("proposes a long on an upside breakout, with confidence", () => {
    const p = agent.decide(snap(uptrendBreakout), ctx);
    expect(p).toMatchObject({ side: "long", intent: "open", asset: "BTC", agentId: "momentum" });
    expect(p!.confidence).toBeGreaterThan(0.5);
    expect(p!.confidence).toBeLessThanOrEqual(0.95);
    expect(p!.size * uptrendBreakout.at(-1)!.c).toBeCloseTo(1_000 * 0.25 * 2, 0); // 25% of value at 2x
  });

  it("proposes a short on a downside breakdown", () => {
    expect(agent.decide(snap(downtrendBreakdown), ctx)).toMatchObject({ side: "short", intent: "open" });
  });

  it("proposes nothing without a breakout", () => {
    expect(agent.decide(snap(uptrendNoBreakout), ctx)).toBeUndefined();
    expect(agent.decide(snap(chop), ctx)).toBeUndefined();
  });

  it("doesn't add to a position it already holds in the breakout's direction", () => {
    expect(agent.decide(snap(uptrendBreakout), { ...ctx, position: 0.005 })).toBeUndefined();
  });

  it("closes a long when price falls through the 10-bar low", () => {
    const p = agent.decide(snap(downtrendBreakdown), { ...ctx, position: 0.005 });
    expect(p).toMatchObject({ intent: "close", side: "long", size: 0.005 });
  });

  it("is deterministic: same candles, same proposal", () => {
    const a = agent.decide(snap(uptrendBreakout), ctx);
    const b = agent.decide(snap(uptrendBreakout), ctx);
    expect({ ...a, proposalId: "" }).toEqual({ ...b, proposalId: "" });
  });

  it("explains itself without the explanation changing the trade (the LLM never decides)", async () => {
    const facts = agent.decide(snap(uptrendBreakout), ctx)!;
    const plain = await agent.explain(facts, async () => "template");
    const llm = await agent.explain(facts, async () => "BTC broke its 20-bar high on a clean trend.");
    expect(llm.rationale).toBe("BTC broke its 20-bar high on a clean trend.");
    expect({ ...llm, rationale: "" }).toEqual({ ...plain, rationale: "" });
  });

  it("falls back to a template rationale when the writer fails", async () => {
    const facts = agent.decide(snap(uptrendBreakout), ctx)!;
    const p = await agent.explain(facts, async () => {
      throw new Error("LLM down");
    });
    expect(p.rationale).toMatch(/BTC .*20-bar high/);
  });
});
