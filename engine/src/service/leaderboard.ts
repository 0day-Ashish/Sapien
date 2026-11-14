// The public leaderboard of Specialist Agents (#18), built from the engine's event store (every runner record),
// the agents' profiles, who leads which Vault now, and the Vaults' fills on HyperCore.

import { riskAdjustedReturn, type AgentProfile } from "../agents/allocator.js";
import type { Regime } from "../agents/types.js";
import type { Fill } from "../ports.js";
import type { RunnerRecord } from "../runner/runner.js";

export type LeaderboardRow = {
  agentId: string;
  regimes: Regime[];
  /** From the agent's profile; the UI overlays the onchain Bond when the AgentRegistry is configured. */
  bondUsdc: number;
  /** Sharpe over the agent's Epoch returns, or the Allocator's prior when it has fewer than 2 Epochs. */
  riskAdjustedReturn: { value: number; usedPrior: boolean; epochs: number };
  /** Vaults this agent leads right now. */
  vaultsLed: string[];
  /** Proposals that reached a verdict: executed or rejected. A trade waiting in its Veto Window counts once it resolves. */
  proposals: number;
  executed: number;
  rejected: number;
  /** Fills on HyperCore for this agent's orders (entries and stop-losses), matched by cloid. */
  fills: number;
  filledNotionalUsdc: number;
  lastActiveAt?: number;
};

export type LeaderboardInput = {
  roster: AgentProfile[];
  history: RunnerRecord[];
  /** Current Lead Agent per Vault. */
  leads: Map<string, string | undefined>;
  fills: Fill[];
};

/** Ranked by risk-adjusted return, then Bond, then name. Agents seen in the history but not on the roster are included. */
export function leaderboard({ roster, history, leads, fills }: LeaderboardInput): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();
  const row = (agentId: string) => {
    let r = rows.get(agentId);
    if (!r) {
      const profile = roster.find((a) => a.agentId === agentId);
      const returns = profile?.epochReturns ?? [];
      const rar = riskAdjustedReturn(returns);
      r = {
        agentId,
        regimes: profile?.regimes ?? [],
        bondUsdc: profile?.bondUsdc ?? 0,
        riskAdjustedReturn: { ...rar, epochs: returns.length },
        vaultsLed: [],
        proposals: 0,
        executed: 0,
        rejected: 0,
        fills: 0,
        filledNotionalUsdc: 0,
      };
      rows.set(agentId, r);
    }
    return r;
  };
  for (const a of roster) row(a.agentId);

  // Which agent placed each order, by the cloids the engine chose.
  const cloidAgent = new Map<string, string>();
  for (const rec of history) {
    const p = rec.proposal;
    if (!p || !rec.result) continue;
    const r = row(p.agentId);
    r.lastActiveAt = Math.max(r.lastActiveAt ?? 0, rec.at);
    if (rec.result.kind === "rejected") {
      r.proposals += 1;
      r.rejected += 1;
    } else if (rec.result.kind === "executed") {
      r.proposals += 1;
      r.executed += 1;
      cloidAgent.set(rec.result.order.entryCloid.toLowerCase(), p.agentId);
      if (rec.result.stopLoss) cloidAgent.set(rec.result.stopLoss.cloid.toLowerCase(), p.agentId);
    }
  }

  for (const f of fills) {
    const agentId = f.cloid && cloidAgent.get(f.cloid.toLowerCase());
    if (!agentId) continue;
    const r = row(agentId);
    r.fills += 1;
    r.filledNotionalUsdc += f.price * f.size;
  }

  for (const [vault, agentId] of leads) if (agentId) row(agentId).vaultsLed.push(vault);

  return [...rows.values()].sort(
    (a, b) => b.riskAdjustedReturn.value - a.riskAdjustedReturn.value || b.bondUsdc - a.bondUsdc || (a.agentId < b.agentId ? -1 : 1),
  );
}
