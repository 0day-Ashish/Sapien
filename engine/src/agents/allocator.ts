import type { Regime } from "./types.js";

export type AgentProfile = {
  agentId: string;
  regimes: Regime[];
  bondUsdc: number;
  /** Realized return per Epoch, oldest first. */
  epochReturns: number[];
};

export type AllocationInput = {
  regime: Regime;
  agents: AgentProfile[];
  /** The Vault's current Lead Agent, if any. */
  current: string | undefined;
  vaultIsFlat: boolean;
  belowBondMinimum?: Set<string>;
};

export type AllocationDecision = {
  leadAgentId: string | undefined;
  /** Set when the best agent differs but the Vault isn't Flat: it takes over once the Vault is Flat. */
  pendingLeadAgentId?: string;
  reason: string;
};

/** Sharpe assumed for an agent with fewer than 2 Epochs of history. */
export const NEW_AGENT_PRIOR = 0.5;
const MAX_SHARPE = 10;

export function riskAdjustedReturn(returns: number[]): { value: number; usedPrior: boolean } {
  if (returns.length < 2) return { value: NEW_AGENT_PRIOR, usedPrior: true };
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const sd = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1));
  const sharpe = sd === 0 ? (mean > 0 ? MAX_SHARPE : 0) : mean / sd;
  return { value: Math.max(-MAX_SHARPE, Math.min(MAX_SHARPE, sharpe)), usedPrior: false };
}

/**
 * Picks the Vault's Lead Agent: among agents that declare the Regime and meet their Bond Minimum, the highest
 * Bond × risk-adjusted return (ties by agentId). A switch waits until the Vault is Flat (ADR-0001).
 */
export function allocate(input: AllocationInput): AllocationDecision {
  const eligible = eligibleAgents(input);
  if (eligible.length === 0) {
    return { leadAgentId: input.current, reason: `${input.regime}: no eligible bonded agent declares this Regime${input.current ? `; ${input.current} stays Lead` : ""}` };
  }

  const scored = eligible
    .map((a) => ({ a, rar: riskAdjustedReturn(a.epochReturns) }))
    .map((x) => ({ ...x, score: x.a.bondUsdc * x.rar.value }))
    .sort((x, y) => y.score - x.score || x.a.agentId.localeCompare(y.a.agentId));
  const best = scored[0]!;
  const why = `${input.regime}: ${best.a.agentId} has the highest Bond × risk-adjusted return (${best.a.bondUsdc} USDC × ${best.rar.usedPrior ? `prior ${NEW_AGENT_PRIOR}` : `Sharpe ${best.rar.value.toFixed(2)}`})`;

  return applySwitch(input, best.a.agentId, why);
}

/** Guardrail 1: only agents that declare the Regime and meet their Bond Minimum may lead. */
export function eligibleAgents(input: AllocationInput) {
  return input.agents.filter((a) => a.regimes.includes(input.regime) && !input.belowBondMinimum?.has(a.agentId));
}

/** Guardrail 2: a new Lead Agent takes over immediately only if the Vault is Flat; otherwise the switch is deferred. */
export function applySwitch(input: AllocationInput, chosen: string, why: string): AllocationDecision {
  if (!input.current || input.current === chosen || input.vaultIsFlat) return { leadAgentId: chosen, reason: why };
  return { leadAgentId: input.current, pendingLeadAgentId: chosen, reason: `${why}; switching from ${input.current} once the Vault is Flat` };
}
