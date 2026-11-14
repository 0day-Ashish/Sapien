import { describe, expect, it } from "vitest";
import { describeVeto, fetchPendingVetoes, secondsLeft, sendVeto, type PendingVeto } from "../lib/engine/veto";

const pending: PendingVeto = {
  proposalId: "p-1",
  agentId: "momentum",
  asset: "BTC",
  side: "long",
  size: 0.01,
  leverage: 2,
  notional: 650.4,
  markPrice: 65_040,
  rationale: "breakout",
  openedAt: 0,
  expiresAt: 60_000,
};

const reply = (status: number, body?: unknown) =>
  (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("Veto Window", () => {
  it("counts down whole seconds and stops at 0", () => {
    expect(secondsLeft(pending, 0)).toBe(60);
    expect(secondsLeft(pending, 59_001)).toBe(1);
    expect(secondsLeft(pending, 61_000)).toBe(0);
  });

  it("describes the trade in plain words, never 'guaranteed'", () => {
    const text = describeVeto(pending);
    expect(text).toBe("Momentum wants to open a 2× long: 0.01 BTC, about 650 USDC.");
    expect(text.toLowerCase()).not.toContain("guarantee");
  });

  it("reads pending vetoes from the Vault status, empty when there are none", async () => {
    expect(await fetchPendingVetoes("0xv", reply(200, { pendingVetoes: [pending] }))).toEqual([pending]);
    expect(await fetchPendingVetoes("0xv", reply(200, {}))).toEqual([]);
  });

  it("reports a veto that arrived after the window ended", async () => {
    expect(await sendVeto("0xv", "p-1", reply(200, { kind: "vetoed" }))).toBe(true);
    expect(await sendVeto("0xv", "p-1", reply(409, { error: "gone" }))).toBe(false);
  });
});
