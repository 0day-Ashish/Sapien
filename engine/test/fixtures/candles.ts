// Fixed 4h candle fixtures. Deterministic (no randomness), so Regime and proposals are reproducible.
import type { Candle } from "../../src/agents/types.js";

const H4 = 4 * 3600 * 1000;
const START = Date.UTC(2026, 10, 1);

function series(closes: number[], range = 0.004): Candle[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1]!;
    return { t: START + i * H4, o, h: Math.max(o, c) * (1 + range), l: Math.min(o, c) * (1 - range), c, v: 100 };
  });
}

/** A steady climb with small pullbacks; the last bar breaks out above every earlier high. */
export const uptrendBreakout: Candle[] = series(
  Array.from({ length: 42 }, (_, i) => 60_000 * (1 + 0.004 * i) * (1 + (i % 3 === 2 ? -0.002 : 0))).concat([60_000 * 1.19]),
);

/** The mirror image: a steady fall that breaks down through every earlier low. */
export const downtrendBreakdown: Candle[] = series(
  Array.from({ length: 42 }, (_, i) => 60_000 * (1 - 0.004 * i) * (1 + (i % 3 === 2 ? 0.002 : 0))).concat([60_000 * 0.81]),
);

/** Sideways chop: oscillates ±1% around 60k with no net move. */
export const chop: Candle[] = series(Array.from({ length: 43 }, (_, i) => 60_000 * (1 + 0.01 * Math.sin(i * 1.3))));

/** Violent swings of ±5% bar to bar. */
export const highVolatility: Candle[] = series(Array.from({ length: 43 }, (_, i) => 60_000 * (1 + (i % 2 === 0 ? 0.05 : -0.05))), 0.02);

/** An uptrend that hasn't broken out yet: the last close is below the prior high. */
export const uptrendNoBreakout: Candle[] = uptrendBreakout.slice(0, 41).concat([{ ...uptrendBreakout[41]!, c: uptrendBreakout[38]!.c }]);
