// Veto Window (ticket #10): the trades waiting for the user's veto, read from the engine's Vault status.

export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://127.0.0.1:8787";

/** Mirrors the engine's PendingVeto (engine/src/engine.ts). */
export type PendingVeto = {
  proposalId: string;
  agentId: string;
  asset: string;
  side: "long" | "short";
  size: number;
  leverage: number;
  notional: number;
  markPrice: number;
  rationale: string;
  openedAt: number;
  expiresAt: number;
};

export async function fetchPendingVetoes(vault: string, fetchFn: typeof fetch = fetch): Promise<PendingVeto[]> {
  const res = await fetchFn(`${ENGINE_URL}/vaults/${vault}/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Engine ${res.status}`);
  const status = (await res.json()) as { pendingVetoes?: PendingVeto[] };
  return status.pendingVetoes ?? [];
}

/** Vetoes a waiting trade. Resolves false if its window had already ended. */
export async function sendVeto(vault: string, proposalId: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchFn(`${ENGINE_URL}/vaults/${vault}/veto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposalId }),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Engine ${res.status}`);
  return true;
}

/** Whole seconds left in the window, never below 0. */
export function secondsLeft(p: PendingVeto, now: number): number {
  return Math.max(0, Math.ceil((p.expiresAt - now) / 1000));
}

const agentName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** "Momentum wants to open a 2× long: 0.01 BTC, about 650 USDC." */
export function describeVeto(p: PendingVeto): string {
  const usdc = Math.round(p.notional).toLocaleString("en-US");
  return `${agentName(p.agentId)} wants to open a ${p.leverage}× ${p.side}: ${p.size} ${p.asset}, about ${usdc} USDC.`;
}
