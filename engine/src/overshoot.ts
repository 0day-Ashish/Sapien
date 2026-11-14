// Overshoot (#15, ADR-0002): the loss on a position beyond an exit exactly at its stop-loss trigger,
// `|fill - trigger| x size`, fees and funding excluded. Only a fill on the losing side of the trigger is Overshoot.
// Infrastructure Failure: no resting stop-loss on HyperCore when the trigger was crossed, judged from the logged
// stop order (its cloid and when it was placed) and its state on HyperCore. Anything else is a market gap.

import type { Cloid, OrderState } from "./ports.js";
import type { AgentId, VaultId } from "./events.js";

/** A stop-loss the engine placed, logged for Overshoot claims. */
export type StopRecord = {
  vaultId: VaultId;
  agentId: AgentId;
  asset: string;
  /** The position's side: a long's stop sells, a short's stop buys. */
  side: "long" | "short";
  size: number;
  triggerPrice: number;
  cloid: Cloid;
  /** When the stop was sent to HyperCore (ms). */
  placedAt: number;
};

/** USDC lost past the trigger: positive only when the fill is worse than the trigger for the position's side. */
export function overshootUsdc(side: "long" | "short", triggerPrice: number, fillPrice: number, size: number): number {
  const past = side === "long" ? triggerPrice - fillPrice : fillPrice - triggerPrice;
  return past > 0 ? past * size : 0;
}

/** Stop states that mean it was on HyperCore's book when the trigger was crossed. */
const RESTED: OrderState[] = ["resting", "triggered", "filled"];

/**
 * Whether Overshoot is an Infrastructure Failure: there was no resting stop-loss when the trigger was crossed.
 * `crossedAt` is when the price was past the trigger (the closing fill's time is a safe upper bound).
 */
export function isInfrastructureFailure(stop: StopRecord | undefined, stopState: OrderState | undefined, crossedAt: number): boolean {
  if (!stop) return true; // never placed
  if (stop.placedAt > crossedAt) return true; // placed only after the trigger was crossed
  return !stopState || !RESTED.includes(stopState); // cancelled, rejected, still waiting for its entry, or unknown
}

/** Open stop-loss exposure for the Coverage Ratio: the notional each stop protects, at its trigger. */
export function stopExposureUsdc(stops: Iterable<StopRecord>): number {
  let total = 0;
  for (const s of stops) total += s.triggerPrice * s.size;
  return total;
}
