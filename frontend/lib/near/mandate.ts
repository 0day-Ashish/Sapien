import { sha256 } from "viem";
import type { Mandate } from "../mandate/schema";

// The Mandate on NEAR: the user commits sha256 of the exact JSON text, and the engine checks the same object against it
// (`POST /near/mandate`, 409 if the hashes differ), so one object is hashed, committed and sent.

/** The Mandate as signed: fixed field order, so the same Mandate always hashes the same. */
export function mandatePayload(m: Mandate) {
  return {
    allowedAssets: m.allowedAssets,
    leverageCap: m.leverageCap,
    stopLossPct: m.stopLossPct,
    drawdownCapPct: m.drawdownCapPct,
    vetoThresholdUsdc: m.vetoThresholdUsdc,
    blackoutWindows: m.blackoutWindows.map((w) => ({ event: w.event, start: w.start, end: w.end })),
  };
}

/** sha256 of the UTF-8 of `JSON.stringify(mandate)`, 64 hex characters without 0x. */
export function mandateHashOf(mandate: object): string {
  return sha256(new TextEncoder().encode(JSON.stringify(mandate))).slice(2);
}
