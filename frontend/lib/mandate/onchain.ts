import { keccak256, stringToHex, type Hex } from "viem";
import { SUPPORTED_ASSETS, mandateSchema, type Mandate, type ResolvedBlackoutWindow } from "./schema";

// How a confirmed Mandate becomes a Mandate Version in the MandateRegistry: the full Mandate
// as JSON (committed by its keccak256 hash and emitted in MandateVersionSigned), plus the
// numeric caps as integers. The Execution Engine rejects a version whose numbers disagree
// with its JSON, so both are derived here from the same Mandate.

/** The exact bytes that are hashed and signed. Key order is fixed so the hash is reproducible. */
export function mandateToJson(mandate: Mandate): string {
  return JSON.stringify({
    allowedAssets: SUPPORTED_ASSETS.filter((asset) => mandate.allowedAssets.includes(asset)),
    leverageCap: mandate.leverageCap,
    stopLossPct: mandate.stopLossPct,
    drawdownCapPct: mandate.drawdownCapPct,
    blackoutWindows: [...mandate.blackoutWindows]
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map((w) => ({ event: w.event, start: w.start, end: w.end })),
    vetoThresholdUsdc: mandate.vetoThresholdUsdc,
  });
}

/** Parses Mandate JSON read back from the chain or a cache. Returns null if it isn't a valid Mandate. */
export function mandateFromJson(json: string): Mandate | null {
  try {
    const parsed = mandateSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const mandateHash = (json: string): Hex => keccak256(stringToHex(json));

export type SignMandateArgs = {
  mandateJson: Hex;
  mandateHash: Hex;
  leverageCapE2: number;
  stopLossBps: number;
  drawdownCapBps: number;
  vetoThresholdUsdc: bigint;
  killFlag: false;
  scopeNotLoosened: boolean;
};

/**
 * Arguments for MandateRegistry.signMandateVersion.
 * @param current The Vault's effective Mandate, if known. Without it, a new version is claimed
 * as possibly looser, so it waits until the Vault is Flat rather than taking effect at once.
 */
export function toSignArgs(mandate: Mandate, current: Mandate | null, hasEffectiveVersion: boolean, now: Date = new Date()): SignMandateArgs {
  const json = mandateToJson(mandate);
  return {
    mandateJson: stringToHex(json),
    mandateHash: mandateHash(json),
    leverageCapE2: Math.round(mandate.leverageCap * 100),
    stopLossBps: Math.round(mandate.stopLossPct * 100),
    drawdownCapBps: Math.round(mandate.drawdownCapPct * 100),
    vetoThresholdUsdc: BigInt(Math.round(mandate.vetoThresholdUsdc * 100)) * 10_000n,
    killFlag: false,
    scopeNotLoosened: hasEffectiveVersion ? current !== null && scopeNotLoosened(current, mandate, now) : true,
  };
}

/**
 * Whether `next` allows no asset and no trading time that `current` forbids: its assets are a
 * subset, and every blackout window of `current` that hasn't ended is still fully blacked out.
 */
export function scopeNotLoosened(current: Mandate, next: Mandate, now: Date = new Date()): boolean {
  if (!next.allowedAssets.every((asset) => current.allowedAssets.includes(asset))) return false;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const covered = mergeWindows(next.blackoutWindows);
  return current.blackoutWindows
    .filter((w) => w.end > nowSeconds)
    .every((w) => {
      const start = Math.max(w.start, nowSeconds);
      return covered.some((c) => c.start <= start && c.end >= w.end);
    });
}

function mergeWindows(windows: Pick<ResolvedBlackoutWindow, "start" | "end">[]) {
  const merged: { start: number; end: number }[] = [];
  for (const w of [...windows].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ start: w.start, end: w.end });
  }
  return merged;
}

/** A Mandate Version's numeric caps as stored onchain, converted back to display units. */
export function capsFromChain(v: { leverageCapE2: number; stopLossBps: number; drawdownCapBps: number; vetoThresholdUsdc: bigint }) {
  return {
    leverageCap: v.leverageCapE2 / 100,
    stopLossPct: v.stopLossBps / 100,
    drawdownCapPct: v.drawdownCapBps / 100,
    vetoThresholdUsdc: Number(v.vetoThresholdUsdc) / 1e6,
  };
}
