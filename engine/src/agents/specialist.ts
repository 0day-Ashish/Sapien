import type { TradeProposal } from "../events.js";
import type { MarketSnapshot, RationaleWriter, Regime, VaultContext } from "./types.js";

/** A Trade Proposal plus the facts the rationale is written from. */
export type AgentProposal = TradeProposal & { facts: Record<string, string | number> };

/** A rule-based Specialist Agent (ADR-0005): decide() is a pure function of the market and the Vault. */
export interface SpecialistAgent {
  readonly agentId: string;
  readonly regimes: Regime[];
  decide(m: MarketSnapshot, v: VaultContext): AgentProposal | undefined;
  explain(p: AgentProposal, write: RationaleWriter): Promise<AgentProposal>;
}

/** Swaps in a writer's rationale. The decision is copied unchanged; on any writer failure the template stays. */
export async function explainProposal(p: AgentProposal, write: RationaleWriter): Promise<AgentProposal> {
  try {
    const text = (await write(p.facts, p.rationale)).trim();
    return { ...p, rationale: text || p.rationale };
  } catch {
    return p;
  }
}

export const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
