import { describe, expect, it } from "vitest";
import { hexToString, keccak256, toHex } from "viem";
import type { Mandate } from "../lib/mandate/schema";
import { formatBps, formatLeverage, mandateHash, mandateJson, signMandateArgs, versionHistory, type MandateVersion } from "../lib/vault/mandate";

const vault = "0x00000000000000000000000000000000000000aa" as const;
const mandate: Mandate = {
  vetoThresholdUsdc: 250.5,
  allowedAssets: ["ETH", "BTC"],
  blackoutWindows: [{ event: "US_CPI", start: 1_800_000_000, end: 1_800_003_600 }],
  drawdownCapPct: 12.5,
  stopLossPct: 2.25,
  leverageCap: 2.5,
};

describe("signMandateVersion arguments", () => {
  it("sign the JSON and caps derived from the same numbers", () => {
    const [v, json, lev, sl, dd, veto, kill, scope] = signMandateArgs(vault, mandate);
    expect(v).toBe(vault);
    expect([lev, sl, dd, veto, kill, scope]).toEqual([250, 225, 1250, BigInt(250_500_000), false, false]);
    expect(keccak256(json)).toBe(mandateHash(mandate));
  });

  it("pass the engine's check: caps read back from the JSON match the onchain ones", () => {
    // engine/src/adapters/hyperevm.ts currentMandate: rounds JSON x100 (x1e6 for USDC) and compares.
    const [, json, lev, sl, dd, veto] = signMandateArgs(vault, mandate);
    const parsed = JSON.parse(hexToString(json));
    expect(Math.round(parsed.leverageCap * 100)).toBe(lev);
    expect(Math.round(parsed.stopLossPct * 100)).toBe(sl);
    expect(Math.round(parsed.drawdownCapPct * 100)).toBe(dd);
    expect(BigInt(Math.round(parsed.vetoThresholdUsdc * 1e6))).toBe(veto);
    expect(parsed.allowedAssets).toEqual(["ETH", "BTC"]);
    expect(parsed.blackoutWindows).toEqual([{ event: "US_CPI", start: 1_800_000_000, end: 1_800_003_600 }]);
  });

  it("hashes the same Mandate the same way whatever its key order", () => {
    const reordered = { ...mandate, leverageCap: 2.5, allowedAssets: ["ETH", "BTC"] } as Mandate;
    expect(mandateJson(reordered)).toBe(mandateJson(mandate));
    expect(mandateJson(mandate).startsWith('{"allowedAssets"')).toBe(true);
    expect(mandateHash(mandate)).toBe(keccak256(toHex(mandateJson(mandate))));
  });
});

describe("Mandate Version history", () => {
  const v = (signedAt: number): MandateVersion => ({ mandateHash: "0x00", leverageCapE2: 300, stopLossBps: 200, drawdownCapBps: 1000, vetoThresholdUsdc: BigInt(0), killFlag: false, signedAt: BigInt(signedAt) });
  it("lists newest first, marking in force, waiting until Flat, and replaced", () => {
    const h = versionHistory([v(1), v(2), v(3)], 2, 3);
    expect(h.map((x) => [x.version, x.status])).toEqual([
      [3, "pending"],
      [2, "effective"],
      [1, "superseded"],
    ]);
  });
  it("formats stored caps back to what was signed", () => {
    expect(formatLeverage(250)).toBe("2.5x");
    expect(formatBps(225)).toBe("2.25%");
  });
});
