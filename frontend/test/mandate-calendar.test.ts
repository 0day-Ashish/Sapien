import { describe, expect, it } from "vitest";
import {
  finalizeMandate,
  newYorkTimeToUnix,
  parseFomcCalendar,
  parseFredReleaseDates,
  type ReleaseCalendar,
} from "../lib/mandate/calendar";
import type { MandateDraft } from "../lib/mandate/schema";

const unix = (iso: string) => Date.parse(iso) / 1000;

const row = (month: string, dates: string) =>
  `<div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>${month}</strong></div>` +
  `<div class="fomc-meeting__date col-xs-4">${dates}</div></div>`;

const fomcHtml =
  `<h4><a id="1">2026 FOMC Meetings</a></h4>${row("December", "8-9*")}` +
  `<h4><a id="2">2027 FOMC Meetings</a></h4>${row("January", "26-27")}${row("Apr/May", "30-1")}${row("July", "27-28")}`;

const draft: MandateDraft = {
  allowedAssets: ["BTC", "ETH"],
  leverageCap: 2,
  stopLossPct: 2,
  drawdownCapPct: 8,
  blackoutWindows: [{ event: "US_CPI", minutesBefore: 60, minutesAfter: 30 }],
  vetoThresholdUsdc: 100,
};

const now = new Date("2026-11-14T00:00:00Z");

describe("newYorkTimeToUnix", () => {
  it("uses EST in winter and EDT in summer", () => {
    expect(newYorkTimeToUnix(2026, 12, 10, 8, 30)).toBe(unix("2026-12-10T13:30:00Z"));
    expect(newYorkTimeToUnix(2027, 7, 14, 8, 30)).toBe(unix("2027-07-14T12:30:00Z"));
  });
});

describe("parseFomcCalendar", () => {
  it("reads each decision as 2:00 p.m. Eastern on the meeting's last day", () => {
    expect(parseFomcCalendar(fomcHtml)).toEqual([
      unix("2026-12-09T19:00:00Z"),
      unix("2027-01-27T19:00:00Z"),
      unix("2027-05-01T18:00:00Z"),
      unix("2027-07-28T18:00:00Z"),
    ]);
  });

  it("returns nothing for a page without meetings", () => {
    expect(parseFomcCalendar("<html>Access Denied</html>")).toEqual([]);
  });
});

describe("parseFredReleaseDates", () => {
  it("reads each release as 8:30 a.m. Eastern", () => {
    const body = { release_dates: [{ release_id: 10, date: "2026-12-10" }, { release_id: 10, date: "2027-07-14" }] };
    expect(parseFredReleaseDates(body)).toEqual([unix("2026-12-10T13:30:00Z"), unix("2027-07-14T12:30:00Z")]);
  });

  it("throws on an error response", () => {
    expect(() => parseFredReleaseDates({ error_code: 400 })).toThrow();
  });
});

describe("finalizeMandate", () => {
  const cpi = [unix("2026-10-14T12:30:00Z"), unix("2026-12-10T13:30:00Z"), unix("2027-01-13T13:30:00Z"), unix("2028-01-12T13:30:00Z")];
  const calendar: ReleaseCalendar = async () => cpi;

  it("turns each blackout event into time windows for upcoming releases only", async () => {
    const result = await finalizeMandate(draft, now, calendar);
    if (!result.ok) throw new Error(result.message);
    expect(result.mandate.blackoutWindows).toEqual([
      { event: "US_CPI", start: unix("2026-12-10T12:30:00Z"), end: unix("2026-12-10T14:00:00Z") },
      { event: "US_CPI", start: unix("2027-01-13T12:30:00Z"), end: unix("2027-01-13T14:00:00Z") },
    ]);
    expect(result.mandate.leverageCap).toBe(2);
    expect(result.coveredUntil).toBe(unix("2027-11-14T00:00:00Z"));
  });

  it("passes a Mandate without blackout windows straight through, without a lookup", async () => {
    const result = await finalizeMandate({ ...draft, blackoutWindows: [] }, now, async () => {
      throw new Error("should not be called");
    });
    expect(result).toMatchObject({ ok: true, mandate: { blackoutWindows: [] } });
  });

  it("fails when the calendar can't be loaded, instead of dropping the blackout", async () => {
    const result = await finalizeMandate(draft, now, async () => {
      throw new Error("FRED_API_KEY is not set");
    });
    expect(result.ok).toBe(false);
  });

  it("fails when no upcoming release is published", async () => {
    const result = await finalizeMandate(draft, now, async () => [unix("2026-10-14T12:30:00Z")]);
    expect(result.ok).toBe(false);
  });
});
