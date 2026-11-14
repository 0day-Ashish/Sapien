import { describe, expect, it } from "vitest";
import { formatCoverage, formatE8, parseEvidence, payoutSources } from "../lib/settlement/payouts";

const base = { overshoot: BigInt(30_000_000), fromBond: BigInt(0), fromReserve: BigInt(0), fromFund: BigInt(0), agentId: "momentum" };

describe("payoutSources", () => {
  it("lists a market gap's Bond and Fund shares in waterfall order", () => {
    const rows = payoutSources({ ...base, fromBond: BigInt(10_000_000), fromFund: BigInt(20_000_000) });
    expect(rows.map((r) => [r.key, r.amount, r.share])).toEqual([
      ["bond", BigInt(10_000_000), 0.3333],
      ["fund", BigInt(20_000_000), 0.6666],
    ]);
    expect(rows[0]!.label).toBe("momentum's Bond");
  });
  it("shows the Reserve for an Infrastructure Failure and what wasn't covered", () => {
    const rows = payoutSources({ ...base, fromReserve: BigInt(5_000_000), fromFund: BigInt(15_000_000) });
    expect(rows.map((r) => r.key)).toEqual(["reserve", "fund", "unpaid"]);
    expect(rows.at(-1)!.amount).toBe(BigInt(10_000_000));
  });
});

describe("formatting", () => {
  it("formats the Coverage Ratio", () => {
    expect(formatCoverage(BigInt(2_500))).toBe("25.0%");
    expect(formatCoverage(BigInt(2) ** BigInt(256) - BigInt(1))).toBe("no open exposure");
  });
  it("formats 8-decimal prices and sizes", () => {
    expect(formatE8(BigInt("6370000000000"))).toBe("63700");
    expect(formatE8(BigInt(1_000_000))).toBe("0.01");
  });
  it("parses the onchain evidence", () => {
    const ref = JSON.stringify({ stop: { cloid: "0x1", asset: "BTC", side: "long", triggerPrice: 1, placedAt: 1, stateOnHyperCore: "filled" }, fill: { orderId: "9", cloid: null, price: 1, size: 1, at: 1 }, overshootUsdc: 5 });
    expect(parseEvidence(ref)?.stop.asset).toBe("BTC");
    expect(parseEvidence("not json")).toBeNull();
  });
});
