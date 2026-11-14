import type { TradeProposal } from "../events.js";
import { efficiencyRatio, REGIME_LOOKBACK } from "./regime.js";
import type { MarketSnapshot, RationaleWriter, Regime, VaultContext } from "./types.js";

const BREAKOUT_BARS = 20;
const EXIT_BARS = 10;
const LEVERAGE = 2;
/** Share of Vault value used as margin per entry. */
const MARGIN_FRACTION = 0.25;

export type AgentProposal = TradeProposal & { facts: Record<string, string | number> };

/**
 * Rule-based Momentum Specialist Agent (ADR-0005). Enters on a close beyond the 20-bar high/low,
 * exits a position when price closes back through the 10-bar low/high. Decisions are pure functions of
 * the candles, so replays reproduce exactly.
 */
export class MomentumAgent {
  readonly agentId = "momentum";
  readonly regimes: Regime[] = ["trend"];

  decide(m: MarketSnapshot, v: VaultContext): AgentProposal | undefined {
    const candles = m.candles4h;
    if (candles.length < BREAKOUT_BARS + 1) return undefined;
    const last = candles.at(-1)!;
    const prior = candles.slice(-BREAKOUT_BARS - 1, -1);
    const exitWindow = candles.slice(-EXIT_BARS - 1, -1);
    const high = Math.max(...prior.map((c) => c.h));
    const low = Math.min(...prior.map((c) => c.l));
    const exitLow = Math.min(...exitWindow.map((c) => c.l));
    const exitHigh = Math.max(...exitWindow.map((c) => c.h));
    const er = efficiencyRatio(candles.slice(-REGIME_LOOKBACK).map((c) => c.c));

    const base = { type: "trade-proposal" as const, vaultId: v.vaultId, agentId: this.agentId, asset: m.asset };
    const id = (intent: string) => `${this.agentId}:${m.asset}:${last.t}:${intent}`;

    // Exits first: a position against the latest move gets closed.
    if (v.position > 0 && last.c < exitLow) {
      const facts = { asset: m.asset, close: last.c, level: exitLow, bars: EXIT_BARS, signal: "exit-long" };
      return { ...base, proposalId: id("close"), side: "long", size: v.position, leverage: 1, intent: "close", confidence: 0.9, rationale: template(facts), facts };
    }
    if (v.position < 0 && last.c > exitHigh) {
      const facts = { asset: m.asset, close: last.c, level: exitHigh, bars: EXIT_BARS, signal: "exit-short" };
      return { ...base, proposalId: id("close"), side: "short", size: -v.position, leverage: 1, intent: "close", confidence: 0.9, rationale: template(facts), facts };
    }

    const up = last.c > high;
    const down = last.c < low;
    if (!up && !down) return undefined;
    if ((up && v.position > 0) || (down && v.position < 0)) return undefined; // already riding it

    const level = up ? high : low;
    const breakoutPct = Math.abs(last.c / level - 1);
    const confidence = round(Math.min(0.95, 0.5 + 0.45 * Math.min(1, er) * Math.min(1, breakoutPct / 0.02)), 2);
    const size = (v.accountValue * MARGIN_FRACTION * LEVERAGE) / last.c;
    const facts = {
      asset: m.asset,
      close: last.c,
      level,
      bars: BREAKOUT_BARS,
      signal: up ? "breakout-long" : "breakdown-short",
      breakoutPct: round(breakoutPct * 100, 2),
      trendStrength: round(er, 2),
      confidence,
    };
    return {
      ...base,
      proposalId: id("open"),
      side: up ? "long" : "short",
      size,
      leverage: LEVERAGE,
      intent: "open",
      confidence,
      rationale: template(facts),
      facts,
    };
  }

  /** Swaps in an LLM-written rationale. The decision is copied unchanged; on any writer failure the template stays. */
  async explain(p: AgentProposal, write: RationaleWriter): Promise<AgentProposal> {
    try {
      const text = (await write(p.facts, p.rationale)).trim();
      return { ...p, rationale: text || p.rationale };
    } catch {
      return p;
    }
  }
}

function template(f: Record<string, string | number>) {
  switch (f.signal) {
    case "breakout-long":
      return `${f.asset} closed at ${f.close}, ${f.breakoutPct}% above its ${f.bars}-bar high of ${f.level}; trend strength ${f.trendStrength}. Going long at confidence ${f.confidence}.`;
    case "breakdown-short":
      return `${f.asset} closed at ${f.close}, ${f.breakoutPct}% below its ${f.bars}-bar low of ${f.level}; trend strength ${f.trendStrength}. Going short at confidence ${f.confidence}.`;
    case "exit-long":
      return `${f.asset} closed at ${f.close}, below its ${f.bars}-bar low of ${f.level}: the uptrend broke, closing the long.`;
    default:
      return `${f.asset} closed at ${f.close}, above its ${f.bars}-bar high of ${f.level}: the downtrend broke, closing the short.`;
  }
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
