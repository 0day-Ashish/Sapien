import { describe, expect, it } from "vitest";
import { compileMandate } from "../lib/mandate/compile";

// Real call to Claude. Runs only when ANTHROPIC_API_KEY is set: `npm run test:live`.
const BRIEF_EXAMPLE =
  "Conservative, BTC and ETH only, never lose more than 8% a month, no trades during US CPI releases.";

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("compileMandate against Claude", () => {
  it("compiles the brief's example to the expected fields", async () => {
    const result = await compileMandate(BRIEF_EXAMPLE);
    if (!result.ok) throw new Error(`${result.reason}: ${result.message}`);
    const { mandate } = result.compiled;

    expect([...mandate.allowedAssets].sort()).toEqual(["BTC", "ETH"]);
    expect(mandate.drawdownCapPct).toBe(8);
    expect(mandate.blackoutWindows.map((w) => w.event)).toEqual(["US_CPI"]);
    // "Conservative" is an appetite, not a number: check the draft stays in a conservative band.
    expect(mandate.leverageCap).toBeLessThanOrEqual(3);
    expect(mandate.stopLossPct).toBeLessThanOrEqual(3);
  }, 60_000);
});
