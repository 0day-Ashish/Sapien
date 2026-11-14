import { describe, expect, it } from "vitest";
import { compileMandate, type DraftMandate } from "../lib/mandate/compile";
import { validateMandateDraft, type MandateDraft } from "../lib/mandate/schema";

const validMandate: MandateDraft = {
  allowedAssets: ["BTC", "ETH"],
  leverageCap: 2,
  stopLossPct: 2,
  drawdownCapPct: 8,
  blackoutWindows: [{ event: "US_CPI", minutesBefore: 60, minutesAfter: 60 }],
  vetoThresholdUsdc: 100,
};

const returns = (output: unknown): DraftMandate => async () => ({ refused: false, output });

describe("compileMandate", () => {
  it("returns the draft when the model output matches the Mandate schema", async () => {
    const result = await compileMandate(
      "Conservative, BTC and ETH only",
      returns({ mandate: validMandate, assumptions: ["Leverage cap of 2 chosen for a conservative profile."] }),
    );
    expect(result).toEqual({
      ok: true,
      compiled: { mandate: validMandate, assumptions: ["Leverage cap of 2 chosen for a conservative profile."] },
    });
  });

  it.each([
    ["leverage above the cap", { ...validMandate, leverageCap: 50 }],
    ["an unsupported asset", { ...validMandate, allowedAssets: ["BTC", "DOGE"] }],
    ["no assets", { ...validMandate, allowedAssets: [] }],
    ["a negative stop-loss", { ...validMandate, stopLossPct: -1 }],
    ["a missing field", { ...validMandate, drawdownCapPct: undefined }],
    ["a string where a number belongs", { ...validMandate, vetoThresholdUsdc: "100" }],
    ["an unknown blackout event", { ...validMandate, blackoutWindows: [{ event: "MOON", minutesBefore: 1, minutesAfter: 1 }] }],
    ["an extra field such as a kill flag", { ...validMandate, killFlag: true }],
  ])("rejects model output with %s", async (_name, mandate) => {
    const result = await compileMandate("anything", returns({ mandate, assumptions: [] }));
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it.each([null, undefined, "not json", 42, {}, { mandate: null, assumptions: [] }])(
    "rejects malformed model output %j",
    async (output) => {
      const result = await compileMandate("anything", returns(output));
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    },
  );

  it("reports a refusal without a draft", async () => {
    const result = await compileMandate("anything", async () => ({ refused: true, output: null }));
    expect(result).toMatchObject({ ok: false, reason: "refused" });
  });

  it("reports the compiler as unavailable when the model call throws", async () => {
    const result = await compileMandate("anything", async () => {
      throw new Error("network down");
    });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("does not call the model for empty or oversized text", async () => {
    let calls = 0;
    const counting: DraftMandate = async () => {
      calls++;
      return { refused: false, output: null };
    };
    expect(await compileMandate("   ", counting)).toMatchObject({ ok: false, reason: "empty" });
    expect(await compileMandate("x".repeat(2001), counting)).toMatchObject({ ok: false, reason: "too-long" });
    expect(calls).toBe(0);
  });
});

describe("validateMandateDraft (gate in front of the signature step)", () => {
  it("accepts a valid Mandate", () => {
    expect(validateMandateDraft(validMandate)).toEqual({ ok: true, mandate: validMandate });
  });

  it("names each field a user edit broke", () => {
    const result = validateMandateDraft({ ...validMandate, leverageCap: 0, allowedAssets: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["allowedAssets", "leverageCap"]);
  });
});
