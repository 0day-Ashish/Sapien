import type { MarketSnapshot, Regime } from "./types.js";

/** 42 × 4h = 7 days. */
export const REGIME_LOOKBACK = 42;
/** Stdev of 4h log returns above this is high-volatility (~2.5% per 4h ≈ 117% annualised). */
const HIGH_VOL = 0.025;
/** |funding| per hour at or above this is funding-skew (0.05%/h ≈ 440% APR). */
const FUNDING_SKEW = 0.0005;
/** Efficiency ratio (net move ÷ path length) at or above this is a trend. */
const TREND = 0.35;

export type RegimeReading = {
  regime: Regime;
  metrics: { realizedVol: number; trendStrength: number; fundingRateHourly: number };
};

/** Deterministic Regime rules, checked in risk order: high-volatility, funding-skew, trend, else chop. */
export function classifyRegime(m: MarketSnapshot): RegimeReading {
  const candles = m.candles4h.slice(-REGIME_LOOKBACK);
  if (candles.length < 20) throw new Error(`Need at least 20 4h candles to classify a Regime, got ${candles.length}`);

  const closes = candles.map((c) => c.c);
  const metrics = { realizedVol: realizedVol(closes), trendStrength: efficiencyRatio(closes), fundingRateHourly: m.fundingRateHourly };
  const regime: Regime =
    metrics.realizedVol >= HIGH_VOL
      ? "high-volatility"
      : Math.abs(m.fundingRateHourly) >= FUNDING_SKEW
        ? "funding-skew"
        : metrics.trendStrength >= TREND
          ? "trend"
          : "chop";
  return { regime, metrics };
}

export function realizedVol(closes: number[]) {
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]!));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, r.length - 1));
}

/** Kaufman efficiency ratio: 1 = a straight line, 0 = all noise. */
export function efficiencyRatio(closes: number[]) {
  const path = closes.slice(1).reduce((a, c, i) => a + Math.abs(c - closes[i]!), 0);
  return path === 0 ? 0 : Math.abs(closes.at(-1)! - closes[0]!) / path;
}
