import { describe, expect, it } from "vitest";
import { compileMandate, geminiDraft, groqDraft, type DraftMandate } from "../lib/mandate/compile";

// Real calls to Gemini and Groq, each alone. Runs only when its key is set: `npm run test:live`.
const BRIEF_EXAMPLE =
  "Conservative, BTC and ETH only, never lose more than 8% a month, no trades during US CPI releases.";

const cases: [string, string | undefined, DraftMandate][] = [
  ["Gemini", process.env.GEMINI_API_KEY, geminiDraft()],
  ["Groq", process.env.GROQ_API_KEY, groqDraft()],
];

describe.each(cases)("compileMandate against %s", (_name, key, draft) => {
  it.skipIf(!key)("compiles the brief's example to the expected fields", async () => {
    const result = await compileMandate(BRIEF_EXAMPLE, draft);
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
