// Premium pricing (#17): `premium rate = k x leverage x volatility / stop-loss distance`, recalibrated each Epoch.
// The rate is a fraction of traded notional; the FeeRouter takes it in parts per million and derives the same tiers.

import type { Mandate } from "./ports.js";

/** Fixed for now (spec #1). 3x leverage, 3% daily volatility, a 2% stop: 0.0001 x 3 x 0.03 / 0.02 = 4.5 bps. */
export const PREMIUM_K = 0.0001;

export type RiskTier = "low" | "medium" | "high";

/** Tier cut-offs, as in FeeRouter: Low below 3 bps, Medium below 8 bps, High from 8 bps. */
const LOW_BELOW = 0.0003;
const MEDIUM_BELOW = 0.0008;

/**
 * The Vault's premium rate from its Mandate (leverage cap, stop-loss distance) and the daily volatility of the most
 * volatile asset it may trade. Assets without a volatility reading are left out; none at all gives 0.
 */
export function premiumRate(mandate: Pick<Mandate, "allowedAssets" | "leverageCap" | "stopLossPct">, dailyVolatility: Record<string, number>): number {
  const vols = mandate.allowedAssets.map((a) => dailyVolatility[a]).filter((v): v is number => Number.isFinite(v));
  if (!vols.length || mandate.stopLossPct <= 0) return 0;
  return (PREMIUM_K * mandate.leverageCap * Math.max(...vols)) / (mandate.stopLossPct / 100);
}

export function riskTier(rate: number): RiskTier {
  return rate < LOW_BELOW ? "low" : rate < MEDIUM_BELOW ? "medium" : "high";
}

/** The rate as the FeeRouter takes it: parts per million of notional. */
export const toPpm = (rate: number): number => Math.round(rate * 1e6);
