import { parseAbi, toHex, type Address, type Hex } from "viem";
import { ENGINE_URL } from "../engine/veto";

// Kill Switch (ticket #9). The owner signs a Mandate Version with the kill flag: it is recorded onchain, takes effect
// at once (it is tighter: no assets allowed), and is what authorises the engine to close every position.

export const MANDATE_REGISTRY = (process.env.NEXT_PUBLIC_MANDATE_REGISTRY_ADDRESS ??
  "0xC08aA5bc113B8CC4Acd5006c9a9B8419Fab4475E") as Address;

export const mandateRegistryAbi = parseAbi([
  "struct MandateVersion { bytes32 mandateHash; uint32 leverageCapE2; uint16 stopLossBps; uint16 drawdownCapBps; uint64 vetoThresholdUsdc; bool killFlag; uint64 signedAt; }",
  "function currentMandate(address vault) view returns (uint256 version, MandateVersion m)",
  "function signMandateVersion(address vault, bytes mandateJson, uint32 leverageCapE2, uint16 stopLossBps, uint16 drawdownCapBps, uint64 vetoThresholdUsdc, bool killFlag, bool scopeNotLoosened) returns (uint256)",
]);

export type OnchainCaps = { leverageCapE2: number; stopLossBps: number; drawdownCapBps: number; vetoThresholdUsdc: bigint };

/**
 * The kill Mandate Version: the current caps unchanged, no allowed assets, no blackout windows, kill flag set.
 * The engine checks the JSON's numbers against the onchain caps, so they are derived from them exactly.
 */
export function killMandateArgs(vault: Address, caps: OnchainCaps) {
  const json = {
    allowedAssets: [] as string[],
    leverageCap: caps.leverageCapE2 / 100,
    stopLossPct: caps.stopLossBps / 100,
    drawdownCapPct: caps.drawdownCapBps / 100,
    vetoThresholdUsdc: Number(caps.vetoThresholdUsdc) / 1e6,
    blackoutWindows: [] as { start: number; end: number }[],
    killFlag: true,
  };
  const mandateJson: Hex = toHex(JSON.stringify(json));
  return {
    json,
    // scopeNotLoosened: true — no assets and no windows is never looser than any earlier version.
    args: [vault, mandateJson, caps.leverageCapE2, caps.stopLossBps, caps.drawdownCapBps, caps.vetoThresholdUsdc, true, true] as const,
  };
}

export type KillResult =
  | { kind: "killed"; closes: { asset: string; side: "long" | "short"; size: number }[]; flat: boolean }
  | { kind: "kill-refused"; reason: string };

/** Asks the engine to close every position. It only acts once it reads the kill flag onchain. */
export async function requestKill(vault: Address, fetchFn: typeof fetch = fetch): Promise<KillResult> {
  const res = await fetchFn(`${ENGINE_URL}/vaults/${vault}/kill`, { method: "POST" });
  if (res.status !== 200 && res.status !== 409) throw new Error(`Engine ${res.status}`);
  return (await res.json()) as KillResult;
}
