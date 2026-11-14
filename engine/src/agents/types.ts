// Shared types for the Allocator and the Specialist Agents (ADR-0005: rules decide, the LLM explains).

export type Regime = "trend" | "chop" | "high-volatility" | "funding-skew";

/** One 4h candle: open time (ms), OHLC, volume. */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

/** What an agent sees of one asset when it decides. */
export type MarketSnapshot = {
  asset: string;
  /** Oldest first, the last one is the latest closed candle. */
  candles4h: Candle[];
  /** Hyperliquid funding rate per hour (0.0001 = 0.01%/h). Positive: longs pay shorts. */
  fundingRateHourly: number;
  /** Recent hourly funding rates, oldest first (optional; agents that need persistence use it). */
  fundingHistoryHourly?: number[];
  markPrice: number;
};

/** What an agent knows about the Vault it's deciding for. */
export type VaultContext = {
  vaultId: string;
  accountValue: number;
  /** Signed position size in the asset: > 0 long, < 0 short, 0 flat. */
  position: number;
};

/** Writes the human-readable rationale from the facts of a decision already made. Never changes the decision. */
export type RationaleWriter = (facts: Record<string, string | number>, template: string) => Promise<string>;
