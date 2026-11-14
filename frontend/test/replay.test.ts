import { describe, expect, it } from "vitest";
import { canonicalJson, fetchExecution, hashDecision, verifyDecision, type DecisionRecord } from "../lib/engine/replay";

// A record and the hash the engine's own hashDecision produced for it (engine/src/engine.ts).
const record: DecisionRecord = {
  proposal: {
    type: "trade-proposal",
    proposalId: "momentum-ETH-1731571200000",
    vaultId: "0x8a4f3c2b1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a",
    agentId: "momentum",
    asset: "ETH",
    side: "long",
    size: 0.0123,
    leverage: 2,
    intent: "open",
    confidence: 0.72,
    rationale: "ETH broke its 4h range with funding neutral.",
  },
  mandateVersion: 3,
  markPrice: 3187.45,
  order: {
    limitPrice: 3219.3245,
    entryCloid: "0x0123456789abcdef0123456789abcdef",
    stopLoss: { cloid: "0xfedcba9876543210fedcba9876543210", triggerPrice: 3123.701 },
  },
};
const ENGINE_HASH = "0x9b43105c0ae68b4e318e7072faa6eada238c3a832011e5a846b3fffcacccbc3d";

const chainWith = (hashes: string[]) => async (h: string) => [hashes.includes(h), BigInt(hashes.includes(h) ? 1731571201 : 0)] as const;

describe("Replay commitment check", () => {
  it("hashes a decision exactly as the engine does", async () => {
    expect(await hashDecision(record)).toBe(ENGINE_HASH);
  });

  it("is independent of key order and drops undefined fields, like the engine", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, "x"] } })).toBe('{"a":{"c":[2,"x"]},"b":1}');
  });

  it("verifies an untouched record against its onchain commitment", async () => {
    const v = await verifyDecision(record, ENGINE_HASH, chainWith([ENGINE_HASH]));
    expect(v).toEqual({ recomputed: ENGINE_HASH, matchesLog: true, onchain: { committed: true, at: 1731571201 }, verified: true });
  });

  it("shows a mismatch for a tampered record", async () => {
    const tampered = { ...record, proposal: { ...record.proposal, size: 0.5 } };
    const v = await verifyDecision(tampered, ENGINE_HASH, chainWith([ENGINE_HASH]));
    expect(v.recomputed).not.toBe(ENGINE_HASH);
    expect(v).toMatchObject({ matchesLog: false, onchain: { committed: false }, verified: false });
  });

  it("doesn't verify a record whose hash was never committed onchain", async () => {
    const v = await verifyDecision(record, ENGINE_HASH, chainWith([]));
    expect(v).toMatchObject({ matchesLog: true, verified: false, onchain: { committed: false } });
  });

  it("reads the order's fill and the stop's status from HyperCore by cloid", async () => {
    const replies: Record<string, unknown> = {
      userFills: [
        { oid: 11, px: "3190", sz: "0.01", time: 5, closedPnl: "0" },
        { oid: 11, px: "3200", sz: "0.0023", time: 6, closedPnl: "0" },
        { oid: 99, px: "1", sz: "1", time: 1, closedPnl: "0" },
      ],
      [record.order.entryCloid]: { status: "order", order: { status: "filled", order: { oid: 11 } } },
      [record.order.stopLoss!.cloid]: { status: "order", order: { status: "open", order: { oid: 12 } } },
    };
    const fetchFn = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { type: string; oid?: string };
      return new Response(JSON.stringify(replies[body.type === "orderStatus" ? body.oid! : body.type]));
    }) as unknown as typeof fetch;

    const x = await fetchExecution(record.proposal.vaultId, record.order.entryCloid, record.order.stopLoss!.cloid, fetchFn);
    expect(x.entry.status).toBe("filled");
    expect(x.entry.fill!.size).toBeCloseTo(0.0123);
    expect(x.entry.fill!.price).toBeCloseTo((3190 * 0.01 + 3200 * 0.0023) / 0.0123);
    expect(x.stop).toEqual({ status: "open" });
  });
});
