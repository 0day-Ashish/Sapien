import { type AgentProposal, explainProposal, round, type SpecialistAgent } from "./specialist.js";
import type { MarketSnapshot, RationaleWriter, Regime, VaultContext } from "./types.js";

/** Enter at or above this hourly rate: the same line the Regime uses for funding-skew (0.05%/h). */
const ENTRY = 0.0005;
/** With history, the recent average must also reach this, on the same side, so a one-hour spike isn't enough. */
const PERSISTENT = 0.0003;
/** Exit once funding fades below this, or flips. */
const EXIT = 0.0001;
const HISTORY_HOURS = 8;
const MARGIN_FRACTION = 0.3;

/**
 * Rule-based Funding-arb Specialist Agent (ADR-0005). It takes the side that receives funding: short when longs pay,
 * long when shorts pay. Vaults hold perps only, so the position is unhedged: it earns funding but carries price risk,
 * which the Mandate's stop-loss bounds. It runs unlevered and smaller than Momentum.
 */
export class FundingArbAgent implements SpecialistAgent {
  readonly agentId = "funding-arb";
  readonly regimes: Regime[] = ["funding-skew"];

  decide(m: MarketSnapshot, v: VaultContext): AgentProposal | undefined {
    const f = m.fundingRateHourly;
    const base = { type: "trade-proposal" as const, vaultId: v.vaultId, agentId: this.agentId, asset: m.asset };
    const stamp = m.candles4h.at(-1)?.t ?? 0;
    // One id per candle, intent and side. The live funding rate must not be part of it: it changes every tick, and the
    // runner and the engine recognise a trade they have already executed, or the user has vetoed, by this id.
    const id = (intent: string, side: "long" | "short") => `${this.agentId}:${m.asset}:${stamp}:${intent}:${side}`;

    // Exits: a short collects while f > 0, a long while f < 0.
    if (v.position !== 0) {
      const collecting = v.position < 0 ? f : -f;
      if (collecting >= EXIT) return undefined; // still paid to hold
      const side = v.position > 0 ? ("long" as const) : ("short" as const);
      const facts = { asset: m.asset, fundingPctPerHour: pct(f), signal: collecting < 0 ? "funding-flipped" : "funding-faded", side };
      return { ...base, proposalId: id("close", side), side, size: Math.abs(v.position), leverage: 1, intent: "close", confidence: 0.85, rationale: template(facts), facts };
    }

    if (Math.abs(f) < ENTRY) return undefined;
    const recent = m.fundingHistoryHourly?.slice(-HISTORY_HOURS);
    if (recent?.length) {
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (Math.sign(avg) !== Math.sign(f) || Math.abs(avg) < PERSISTENT) return undefined;
    }

    const side = f > 0 ? ("short" as const) : ("long" as const);
    const confidence = round(Math.min(0.9, 0.5 + 0.4 * Math.min(1, (Math.abs(f) - ENTRY) / (3 * ENTRY))), 2);
    const facts = {
      asset: m.asset,
      fundingPctPerHour: pct(f),
      payer: f > 0 ? "longs" : "shorts",
      side,
      aprPct: round(Math.abs(f) * 24 * 365 * 100, 0),
      confidence,
      signal: "collect-funding",
    };
    return {
      ...base,
      proposalId: id("open", side),
      side,
      size: (v.accountValue * MARGIN_FRACTION) / m.markPrice,
      leverage: 1,
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

const pct = (f: number) => round(f * 100, 4);

function template(f: Record<string, string | number>) {
  if (f.signal === "collect-funding") {
    return `On ${f.asset}, ${f.payer} pay ${Math.abs(Number(f.fundingPctPerHour))}%/h in funding (about ${f.aprPct}% a year). Going ${f.side} to collect it, unhedged, at confidence ${f.confidence}.`;
  }
  return f.signal === "funding-flipped"
    ? `${f.asset} funding flipped to ${f.fundingPctPerHour}%/h, so the ${f.side} now pays instead of collecting. Closing it.`
    : `${f.asset} funding faded to ${f.fundingPctPerHour}%/h, too little to be worth the price risk. Closing the ${f.side}.`;
}
