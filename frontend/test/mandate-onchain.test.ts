import { hexToString, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { capsFromChain, mandateFromJson, mandateToJson, scopeNotLoosened, toSignArgs } from "../lib/mandate/onchain";
import { validateMandateDraft, type Mandate } from "../lib/mandate/schema";

const now = new Date("2026-11-14T00:00:00Z");
const t = (iso: string) => Date.parse(iso) / 1000;
const cpiDec = { event: "US_CPI" as const, start: t("2026-12-10T12:30:00Z"), end: t("2026-12-10T14:30:00Z") };
const cpiJan = { event: "US_CPI" as const, start: t("2027-01-13T12:30:00Z"), end: t("2027-01-13T14:30:00Z") };

const mandate: Mandate = {
  allowedAssets: ["ETH", "BTC"],
  leverageCap: 2.5,
  stopLossPct: 2,
  drawdownCapPct: 8,
  blackoutWindows: [cpiJan, cpiDec],
  vetoThresholdUsdc: 100.5,
};

describe("toSignArgs", () => {
  it("converts the caps to the registry's integer units", () => {
    expect(toSignArgs(mandate, null, false, now)).toMatchObject({
      leverageCapE2: 250,
      stopLossBps: 200,
      drawdownCapBps: 800,
      vetoThresholdUsdc: 100_500_000n,
      killFlag: false,
    });
  });

  it("commits to JSON that round-trips to the same Mandate, in a stable order", () => {
    const args = toSignArgs(mandate, null, false, now);
    const json = hexToString(args.mandateJson);
    expect(args.mandateHash).toBe(keccak256(args.mandateJson));
    expect(json).toBe(mandateToJson({ ...mandate, allowedAssets: ["BTC", "ETH"], blackoutWindows: [cpiDec, cpiJan] }));
    expect(mandateFromJson(json)).toEqual({ ...mandate, allowedAssets: ["BTC", "ETH"], blackoutWindows: [cpiDec, cpiJan] });
  });

  it("claims scope not loosened only when the current Mandate is known and no looser", () => {
    expect(toSignArgs(mandate, null, false, now).scopeNotLoosened).toBe(true); // first version
    expect(toSignArgs(mandate, null, true, now).scopeNotLoosened).toBe(false); // current unknown
    expect(toSignArgs(mandate, mandate, true, now).scopeNotLoosened).toBe(true);
    expect(toSignArgs({ ...mandate, allowedAssets: ["BTC", "ETH", "SOL"] }, mandate, true, now).scopeNotLoosened).toBe(false);
  });
});

describe("scopeNotLoosened", () => {
  it("allows dropping an asset, refuses adding one", () => {
    expect(scopeNotLoosened(mandate, { ...mandate, allowedAssets: ["BTC"] }, now)).toBe(true);
    expect(scopeNotLoosened({ ...mandate, allowedAssets: ["BTC"] }, mandate, now)).toBe(false);
  });

  it("refuses removing or shortening an upcoming blackout window", () => {
    expect(scopeNotLoosened(mandate, { ...mandate, blackoutWindows: [cpiDec] }, now)).toBe(false);
    expect(scopeNotLoosened(mandate, { ...mandate, blackoutWindows: [cpiDec, { ...cpiJan, end: cpiJan.end - 60 }] }, now)).toBe(false);
  });

  it("allows adding or widening windows, and ignores windows already over", () => {
    const wider = { ...cpiDec, start: cpiDec.start - 3600 };
    expect(scopeNotLoosened(mandate, { ...mandate, blackoutWindows: [wider, cpiJan] }, now)).toBe(true);
    const past = { event: "US_CPI" as const, start: t("2026-10-14T11:30:00Z"), end: t("2026-10-14T13:30:00Z") };
    expect(scopeNotLoosened({ ...mandate, blackoutWindows: [past, cpiDec, cpiJan] }, mandate, now)).toBe(true);
  });
});

describe("chain units", () => {
  it("reads caps back in display units", () => {
    expect(capsFromChain({ leverageCapE2: 250, stopLossBps: 200, drawdownCapBps: 800, vetoThresholdUsdc: 100_500_000n })).toEqual({
      leverageCap: 2.5,
      stopLossPct: 2,
      drawdownCapPct: 8,
      vetoThresholdUsdc: 100.5,
    });
  });

  it("refuses a draft with more decimals than the registry can store", () => {
    const result = validateMandateDraft({ ...mandate, blackoutWindows: [], leverageCap: 2.555 });
    expect(result).toMatchObject({ ok: false, errors: { leverageCap: "Use at most two decimal places" } });
  });

  it("rejects JSON that is not a Mandate", () => {
    expect(mandateFromJson("{}")).toBeNull();
    expect(mandateFromJson("not json")).toBeNull();
  });
});
