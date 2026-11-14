import { fromHex } from "viem";
import { describe, expect, it } from "vitest";
import { killMandateArgs, requestKill } from "../lib/vault/kill";

const vault = "0x00000000000000000000000000000000000000aa";
const caps = { leverageCapE2: 300, stopLossBps: 200, drawdownCapBps: 800, vetoThresholdUsdc: BigInt(500_000_000) };

describe("Kill Switch", () => {
  it("signs a Mandate Version with the kill flag and the current caps, so it takes effect at once", () => {
    const { args } = killMandateArgs(vault, caps);
    const [v, , lev, sl, dd, veto, killFlag, scopeNotLoosened] = args;
    expect([v, lev, sl, dd, veto, killFlag, scopeNotLoosened]).toEqual([vault, 300, 200, 800, BigInt(500_000_000), true, true]);
  });

  it("writes JSON whose numbers match the onchain caps exactly, as the engine checks", () => {
    const { args } = killMandateArgs(vault, caps);
    const json = JSON.parse(fromHex(args[1], "string"));
    expect(json).toEqual({
      allowedAssets: [],
      leverageCap: 3,
      stopLossPct: 2,
      drawdownCapPct: 8,
      vetoThresholdUsdc: 500,
      blackoutWindows: [],
      killFlag: true,
    });
    // The engine's comparison: round(x * 100) against the E2/bps caps, round(veto * 1e6) against the 6-decimal cap.
    expect(Math.round(json.leverageCap * 100)).toBe(caps.leverageCapE2);
    expect(Math.round(json.stopLossPct * 100)).toBe(caps.stopLossBps);
    expect(BigInt(Math.round(json.vetoThresholdUsdc * 1e6))).toBe(caps.vetoThresholdUsdc);
  });

  it("returns the engine's refusal instead of throwing", async () => {
    const reply = (async () =>
      new Response(JSON.stringify({ kind: "kill-refused", reason: "flag not set" }), { status: 409 })) as unknown as typeof fetch;
    expect(await requestKill(vault, reply)).toEqual({ kind: "kill-refused", reason: "flag not set" });
  });
});
