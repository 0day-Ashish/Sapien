import { type AgentProposal, explainProposal, round, type SpecialistAgent } from "./specialist.js";
import type { MarketSnapshot, RationaleWriter, Regime, VaultContext } from "./types.js";

const WINDOW = 20;
/** Enter when the close is this many standard deviations from the 20-bar mean. */
const ENTRY_Z = 2;
/** Exit once it's back within this. */
const EXIT_Z = 0.5;
const LEVERAGE = 2;
const MARGIN_FRACTION = 0.2;

/** z-score of the last close against the mean and stdev of the closes before it (last WINDOW bars). */
export function zScore(closes: number[]) {
  const prior = closes.slice(-WINDOW - 1, -1);
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, prior.length - 1));
  return sd === 0 ? 0 : (closes.at(-1)! - mean) / sd;
}

/**
 * Rule-based Mean-reversion Specialist Agent (ADR-0005), eligible in the chop Regime: in a range, a close far
 * outside the band tends to snap back. Buys below the band, sells above, and closes once price is back near the mean.
 */
export class MeanReversionAgent implements SpecialistAgent {
  readonly agentId = "mean-reversion";
  readonly regimes: Regime[] = ["chop"];

  decide(m: MarketSnapshot, v: VaultContext): AgentProposal | undefined {
    const closes = m.candles4h.map((c) => c.c);
    if (closes.length < WINDOW + 1) return undefined;
    const z = zScore(closes);
    const last = m.candles4h.at(-1)!;
    const prior = closes.slice(-WINDOW - 1, -1);
    const mean = round(prior.reduce((a, b) => a + b, 0) / prior.length, 2);
    const base = { type: "trade-proposal" as const, vaultId: v.vaultId, agentId: this.agentId, asset: m.asset };
    const id = (intent: string) => `${this.agentId}:${m.asset}:${last.t}:${intent}`;

    if (v.position !== 0) {
      if (Math.abs(z) > EXIT_Z) return undefined; // not reverted yet
      const side = v.position > 0 ? ("long" as const) : ("short" as const);
      const facts = { asset: m.asset, close: last.c, mean, z: round(z, 2), side, signal: "reverted" };
      return { ...base, proposalId: id("close"), side, size: Math.abs(v.position), leverage: 1, intent: "close", confidence: 0.85, rationale: template(facts), facts };
    }

    if (Math.abs(z) < ENTRY_Z) return undefined;
    const side = z < 0 ? ("long" as const) : ("short" as const);
    const confidence = round(Math.min(0.85, 0.5 + 0.35 * Math.min(1, (Math.abs(z) - ENTRY_Z) / ENTRY_Z)), 2);
    const facts = { asset: m.asset, close: last.c, mean, z: round(z, 2), bars: WINDOW, side, confidence, signal: z < 0 ? "stretched-down" : "stretched-up" };
    return {
      ...base,
      proposalId: id("open"),
      side,
      size: (v.accountValue * MARGIN_FRACTION * LEVERAGE) / last.c,
      leverage: LEVERAGE,
      intent: "open",
      confidence,
      rationale: template(facts),
      facts,
    };
  }

  explain(p: AgentProposal, write: RationaleWriter) {
    return explainProposal(p, write);
  }
}

function template(f: Record<string, string | number>) {
  if (f.signal === "reverted") return `${f.asset} is back at ${f.close}, near its average of ${f.mean}. The snap-back happened, so the ${f.side} closes.`;
  const where = f.signal === "stretched-down" ? "below" : "above";
  return `${f.asset} closed at ${f.close}, ${Math.abs(Number(f.z))} standard deviations ${where} its ${f.bars}-bar average of ${f.mean} in a ranging market. Going ${f.side} for the snap back, at confidence ${f.confidence}.`;
}
