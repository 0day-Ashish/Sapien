import type { Address } from "viem";
import { ENGINE_URL } from "../engine/veto";

// Kill Switch. The user flips it on NEAR (`set_killed` on the Sapien contract, signed in their wallet); the engine reads
// the flag, closes every position, freezes the Lead Agent and reports the Vault Flat, which unlocks withdrawal.

export type KillResult =
  | { kind: "killed"; closes: { asset: string; side: "long" | "short"; size: number }[]; flat: boolean }
  | { kind: "kill-refused"; reason: string };

/** Nudges the engine to close every position now rather than at its next read of the NEAR flag. */
export async function requestKill(vault: Address | string, fetchFn: typeof fetch = fetch): Promise<KillResult> {
  const res = await fetchFn(`${ENGINE_URL}/vaults/${vault}/kill`, { method: "POST" });
  if (res.status !== 200 && res.status !== 409) throw new Error(`Engine ${res.status}`);
  return (await res.json()) as KillResult;
}
