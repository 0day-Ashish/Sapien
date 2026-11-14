import {
  mandateSchema,
  type BlackoutWindow,
  type Mandate,
  type MandateDraft,
  type ResolvedBlackoutWindow,
} from "./schema";

// Turns a blackout event ("US CPI release") into real time windows by reading the
// official release calendars. The user signs exact times, so the Execution Engine needs
// no calendar of its own.
//
// Sources:
// - US_FOMC: the Federal Reserve's public FOMC calendar page. The decision is released
//   at 2:00 p.m. Eastern on the last day of each meeting.
// - US_CPI, US_NFP: FRED release dates (St. Louis Fed), which needs a free FRED_API_KEY.
//   Both are released at 8:30 a.m. Eastern.

export type BlackoutEvent = BlackoutWindow["event"];

/** How far ahead a signed Mandate lists blackout windows. After this the user signs a new Mandate Version. */
export const BLACKOUT_HORIZON_DAYS = 365;

const NEW_YORK = "America/New_York";
const FOMC_CALENDAR_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const FRED_RELEASE_DATES_URL = "https://api.stlouisfed.org/fred/release/dates";
const FRED_RELEASE_ID: Record<Exclude<BlackoutEvent, "US_FOMC">, number> = {
  US_CPI: 10, // Consumer Price Index
  US_NFP: 50, // Employment Situation
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Unix seconds for a wall-clock time in New York, correct across daylight saving. */
export function newYorkTimeToUnix(year: number, month: number, day: number, hour: number, minute: number): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shownAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return (asUtc - (shownAsUtc - asUtc)) / 1000;
}

/** FOMC decision times (unix seconds) from the Fed's calendar page HTML. */
export function parseFomcCalendar(html: string): number[] {
  const times: number[] = [];
  const panels = html.split(/(?=>\s*\d{4} FOMC Meetings)/);
  for (const panel of panels) {
    const year = Number(panel.match(/^>\s*(\d{4}) FOMC Meetings/)?.[1]);
    if (!year) continue;
    const rows = panel.matchAll(
      /fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g,
    );
    for (const [, monthText, dateText] of rows) {
      // A meeting can span two months: "Apr/May" with dates "30-1". The decision is on the last day.
      const monthName = monthText.split("/").at(-1)!.trim().toLowerCase();
      const month = MONTHS.findIndex((m) => m.startsWith(monthName.slice(0, 3))) + 1;
      const day = Number(dateText.match(/(\d+)\D*$/)?.[1]);
      if (!month || !day) continue;
      times.push(newYorkTimeToUnix(year, month, day, 14, 0));
    }
  }
  return times.sort((a, b) => a - b);
}

/** Release times (unix seconds) from a FRED `release/dates` response. Releases are at 8:30 a.m. Eastern. */
export function parseFredReleaseDates(body: unknown): number[] {
  const dates = (body as { release_dates?: { date?: unknown }[] } | null)?.release_dates;
  if (!Array.isArray(dates)) throw new Error("Unexpected FRED response");
  const times: number[] = [];
  for (const entry of dates) {
    const match = typeof entry?.date === "string" ? entry.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
    if (!match) continue;
    times.push(newYorkTimeToUnix(Number(match[1]), Number(match[2]), Number(match[3]), 8, 30));
  }
  return times.sort((a, b) => a - b);
}

/** Looks up an event's scheduled release times. May return past or far-future times. */
export type ReleaseCalendar = (event: BlackoutEvent) => Promise<number[]>;

export const officialCalendar: ReleaseCalendar = async (event) => {
  if (event === "US_FOMC") {
    const response = await fetch(FOMC_CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; release-calendar-client)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Fed calendar returned ${response.status}`);
    return parseFomcCalendar(await response.text());
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY is not set");
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL(FRED_RELEASE_DATES_URL);
  url.search = new URLSearchParams({
    release_id: String(FRED_RELEASE_ID[event]),
    api_key: apiKey,
    file_type: "json",
    include_release_dates_with_no_data: "true",
    realtime_start: today,
    realtime_end: "9999-12-31",
    sort_order: "asc",
    limit: "100",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`FRED returned ${response.status}`);
  return parseFredReleaseDates(await response.json());
};

export type FinalizeResult =
  | { ok: true; mandate: Mandate; coveredUntil: number }
  | { ok: false; message: string };

/**
 * Builds the Mandate to sign from a confirmed draft. Every blackout event must resolve to
 * at least one scheduled release inside the horizon; otherwise this fails, so a blackout
 * the user asked for is never silently left out.
 */
export async function finalizeMandate(
  draft: MandateDraft,
  now: Date = new Date(),
  calendar: ReleaseCalendar = officialCalendar,
): Promise<FinalizeResult> {
  const from = Math.floor(now.getTime() / 1000);
  const coveredUntil = from + BLACKOUT_HORIZON_DAYS * 86_400;
  const windows: ResolvedBlackoutWindow[] = [];

  for (const window of draft.blackoutWindows) {
    let releases: number[];
    try {
      releases = await calendar(window.event);
    } catch (error) {
      console.error(`Release calendar lookup failed for ${window.event}`, error);
      return {
        ok: false,
        message: "Couldn't load the release calendar for your blackout windows. Try again, or remove the blackout window to continue without it.",
      };
    }
    const resolved = releases
      .map((at) => ({
        event: window.event,
        start: at - window.minutesBefore * 60,
        end: at + Math.max(window.minutesAfter, 1) * 60,
      }))
      .filter((w) => w.end > from && w.start <= coveredUntil);
    if (resolved.length === 0) {
      return {
        ok: false,
        message: "No upcoming release dates are published yet for one of your blackout windows. Try again later, or remove it to continue.",
      };
    }
    windows.push(...resolved);
  }

  windows.sort((a, b) => a.start - b.start);
  const parsed = mandateSchema.safeParse({ ...draft, blackoutWindows: windows });
  if (!parsed.success) {
    return { ok: false, message: "The Mandate could not be finalized. Check your fields and try again." };
  }
  return { ok: true, mandate: parsed.data, coveredUntil };
}
