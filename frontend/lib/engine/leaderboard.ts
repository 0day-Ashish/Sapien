import { ENGINE_URL } from "./veto";

// Leaderboard (ticket #18): the engine's event store ranks the agents; the AgentRegistry, when configured, supplies
// the real Bonds and the Vaults each agent leads. Mirrors engine/src/service/leaderboard.ts.

export type LeaderboardRow = {
  agentId: string;
  regimes: string[];
  bondUsdc: number;
  riskAdjustedReturn: { value: number; usedPrior: boolean; epochs: number };
  vaultsLed: string[];
  proposals: number;
  executed: number;
  rejected: number;
  fills: number;
  filledNotionalUsdc: number;
  lastActiveAt?: number;
};

/** A row with where its Bond and Vaults-led figures came from. */
export type BoardRow = LeaderboardRow & { bondSource: "onchain" | "engine"; vaultsLedCount: number };

export async function fetchLeaderboard(fetchFn: typeof fetch = fetch): Promise<{ rows: LeaderboardRow[]; at: number }> {
  const res = await fetchFn(`${ENGINE_URL}/leaderboard`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Engine ${res.status}`);
  return (await res.json()) as { rows: LeaderboardRow[]; at: number };
}

/** Onchain Bond (USDC, 6 decimals) and Vaults led, per agent, from the AgentRegistry. */
export type OnchainAgent = { bond: bigint; ledVaults: number; registered: boolean };

/** Uses the chain's figures wherever the agent is registered there, and the engine's otherwise. */
export function withOnchain(rows: LeaderboardRow[], onchain: Map<string, OnchainAgent>): BoardRow[] {
  return rows.map((r) => {
    const c = onchain.get(r.agentId);
    return c?.registered
      ? { ...r, bondUsdc: Number(c.bond) / 1e6, vaultsLedCount: c.ledVaults, bondSource: "onchain" }
      : { ...r, vaultsLedCount: r.vaultsLed.length, bondSource: "engine" };
  });
}

/** "2.31" for a measured Sharpe; "0.50 (prior)" while an agent has fewer than 2 Epochs. */
export function formatRar(r: LeaderboardRow["riskAdjustedReturn"]): string {
  return r.usedPrior ? `${r.value.toFixed(2)} (prior)` : r.value.toFixed(2);
}

/** Share of the agent's proposals that passed the Mandate Check and were executed. */
export function executionRate(r: LeaderboardRow): string {
  return r.proposals ? `${Math.round((r.executed / r.proposals) * 100)}%` : "–";
}
