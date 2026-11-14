// The Allocator's choice of Lead Agent, made by Jev (TypeSafe AI) among the agents the rules allow.
// Rules still decide who is eligible (declares the Regime, meets its Bond Minimum) and keep a switch waiting until
// the Vault is Flat. If Jev fails or answers outside the eligible set, the rule-based Bond × Sharpe pick is used.

import { choice, type EntryType, TypeSafeClient } from "@typesafe-ai/sdk";
import { allocate, type AllocationDecision, type AllocationInput, applySwitch, eligibleAgents, riskAdjustedReturn } from "./allocator.js";

export type LeadCandidate = {
  agentId: string;
  regimes: string[];
  bondUsdc: number;
  riskAdjustedReturn: number;
  usedPrior: boolean;
  epochs: number;
};

export type LeadSelection = { agentId: string; probabilities: Record<string, number>; confidence: number };

/** Asks a decision model which candidate should lead. Injected, so tests and fallbacks don't need the network. */
export type LeadSelector = (state: { regime: string; market?: Record<string, unknown>; currentLead?: string; candidates: LeadCandidate[] }) => Promise<LeadSelection>;

export type JevAllocationDecision = AllocationDecision & {
  source: "jev" | "rules";
  probabilities?: Record<string, number>;
  confidence?: number;
};

export function jevLeadSelector(client: TypeSafeClient = new TypeSafeClient()): LeadSelector {
  return async (state) => {
    const criteria = Object.fromEntries(
      state.candidates.map((c) => [
        c.agentId,
        `${c.agentId}: Bond ${c.bondUsdc} USDC, ${c.usedPrior ? "no track record yet" : `Sharpe ${c.riskAdjustedReturn.toFixed(2)} over ${c.epochs} Epochs`}`,
      ]),
    );
    const { answers } = await client.systemOne({
      // Plain JSON only (drops undefined fields).
      state: JSON.parse(JSON.stringify({
        task: "Pick the Specialist Agent that should lead this perp trading Vault next. Every candidate is already bonded and declares the current market Regime. Weigh the size of its Bond (its own money at risk) and its risk-adjusted track record; be cautious with agents that have no track record.",
        ...state,
      })) as NonNullable<EntryType>,
      questions: { lead: choice("Which agent should lead the Vault?", criteria) },
    });
    const a = answers.lead;
    return { agentId: a.choice, probabilities: { ...a.probabilities }, confidence: a.confidence };
  };
}

export async function allocateWithJev(
  input: AllocationInput & { market?: Record<string, unknown> },
  select: LeadSelector,
): Promise<JevAllocationDecision> {
  const eligible = eligibleAgents(input);
  // Nothing to choose between: no model call needed.
  if (eligible.length < 2) return { ...allocate(input), source: "rules" };

  const candidates: LeadCandidate[] = eligible.map((a) => {
    const rar = riskAdjustedReturn(a.epochReturns);
    return { agentId: a.agentId, regimes: a.regimes, bondUsdc: a.bondUsdc, riskAdjustedReturn: rar.value, usedPrior: rar.usedPrior, epochs: a.epochReturns.length };
  });

  try {
    const pick = await select({ regime: input.regime, ...(input.market ? { market: input.market } : {}), ...(input.current ? { currentLead: input.current } : {}), candidates });
    if (!eligible.some((a) => a.agentId === pick.agentId)) throw new Error(`Jev picked ${pick.agentId}, which is not eligible`);
    const pct = (p: number) => `${Math.round(p * 100)}%`;
    const odds = Object.entries(pick.probabilities)
      .sort(([, x], [, y]) => y - x)
      .map(([id, p]) => `${id} ${pct(p)}`)
      .join(", ");
    const why = `${input.regime}: Jev chose ${pick.agentId} (confidence ${pct(pick.confidence)}; ${odds})`;
    return { ...applySwitch(input, pick.agentId, why), source: "jev", probabilities: pick.probabilities, confidence: pick.confidence };
  } catch (e) {
    const rules = allocate(input);
    return { ...rules, reason: `Jev unavailable (${(e as Error).message}); by rules: ${rules.reason}`, source: "rules" };
  }
}
