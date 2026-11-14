import { z } from "zod";

// The Mandate fields a user confirms before signing. Terms follow GLOSSARY.md.
// The same schema validates Claude's draft and the user's edits, so nothing that
// fails it can reach the signature step. The kill flag is not drafted here: it is
// set by the Kill Switch, never by the compiler.

export const SUPPORTED_ASSETS = ["BTC", "ETH", "SOL", "HYPE"] as const;

export const BLACKOUT_EVENTS = {
  US_CPI: "US CPI release",
  US_FOMC: "US FOMC rate decision",
  US_NFP: "US non-farm payrolls",
} as const;

export const blackoutEventIds = Object.keys(BLACKOUT_EVENTS) as [
  keyof typeof BLACKOUT_EVENTS,
  ...(keyof typeof BLACKOUT_EVENTS)[],
];

export const LIMITS = {
  leverageCap: { min: 1, max: 10 },
  stopLossPct: { min: 0.5, max: 20 },
  drawdownCapPct: { min: 1, max: 50 },
  vetoThresholdUsdc: { min: 0, max: 1000 },
  blackoutMinutes: { min: 0, max: 720 },
} as const;

const inRange = (limits: { min: number; max: number }) =>
  z.number().min(limits.min).max(limits.max);

// The MandateRegistry stores these as integers (x100), so more than two decimals can't be signed.
const twoDecimals = (limits: { min: number; max: number }) =>
  inRange(limits).refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Use at most two decimal places");

export const blackoutWindowSchema = z.strictObject({
  event: z.enum(blackoutEventIds),
  minutesBefore: inRange(LIMITS.blackoutMinutes).int(),
  minutesAfter: inRange(LIMITS.blackoutMinutes).int(),
});

export const mandateDraftSchema = z.strictObject({
  allowedAssets: z
    .array(z.enum(SUPPORTED_ASSETS))
    .min(1)
    .refine((assets) => new Set(assets).size === assets.length, "Duplicate asset"),
  /** Maximum leverage on any position. */
  leverageCap: twoDecimals(LIMITS.leverageCap),
  /** Stop-loss distance from entry, as a % of the entry price. */
  stopLossPct: twoDecimals(LIMITS.stopLossPct),
  /** Drawdown from the High-Water Mark within a calendar month, in %, that triggers an Automatic Kill. */
  drawdownCapPct: twoDecimals(LIMITS.drawdownCapPct),
  /** No new positions open inside these windows. */
  blackoutWindows: z
    .array(blackoutWindowSchema)
    .refine(
      (windows) => new Set(windows.map((w) => w.event)).size === windows.length,
      "Duplicate blackout event",
    ),
  /** Trades with a notional above this (USDC) wait in the Veto Window. */
  vetoThresholdUsdc: twoDecimals(LIMITS.vetoThresholdUsdc),
});

export type BlackoutWindow = z.infer<typeof blackoutWindowSchema>;
export type MandateDraft = z.infer<typeof mandateDraftSchema>;

/** What the compiler returns: the draft plus what Claude assumed for anything the user left unsaid. */
export const compiledMandateSchema = z.strictObject({
  mandate: mandateDraftSchema,
  assumptions: z.array(z.string().max(300)).max(10),
});

export type CompiledMandate = z.infer<typeof compiledMandateSchema>;

/**
 * A blackout window with real times: unix seconds, UTC. Built from a draft window by
 * looking up the event's release calendar (see calendar.ts).
 */
export const resolvedBlackoutWindowSchema = z
  .strictObject({
    event: z.enum(blackoutEventIds),
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine((w) => w.start < w.end, "Blackout window must start before it ends");

/** The Mandate the user signs: the confirmed draft with blackout windows as real times. */
export const mandateSchema = mandateDraftSchema.extend({
  blackoutWindows: z.array(resolvedBlackoutWindowSchema).max(100),
});

export type ResolvedBlackoutWindow = z.infer<typeof resolvedBlackoutWindowSchema>;
export type Mandate = z.infer<typeof mandateSchema>;

export type ValidationResult =
  | { ok: true; mandate: MandateDraft }
  | { ok: false; errors: Record<string, string> };

/** The single gate in front of the signature step. */
export function validateMandateDraft(input: unknown): ValidationResult {
  const result = mandateDraftSchema.safeParse(input);
  if (result.success) return { ok: true, mandate: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "mandate");
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
