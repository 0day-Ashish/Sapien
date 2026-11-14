import { describe, expect, it } from "vitest";
import { bridgeOutArgs, withdrawStage } from "../lib/cctp/withdraw";

const quotes = [
  { finalityThreshold: 1000, minimumFee: 0, forwardFee: { low: 52914, med: 53009, high: 53233 } },
  { finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 52914, med: 53009, high: 53233 } },
];
const user = "0x00000000000000000000000000000000000000Aa";

describe("bridgeOutArgs", () => {
  it("burns to Base Sepolia, recipient left-padded, maxFee from the standard-finality quote", () => {
    expect(bridgeOutArgs(BigInt(10_000_000), user, quotes)).toEqual([
      BigInt(10_000_000),
      6,
      "0x00000000000000000000000000000000000000000000000000000000000000aa",
      BigInt(53_233),
    ]);
  });
  it("refuses an amount that doesn't cover the fee", () => {
    expect(() => bridgeOutArgs(BigInt(50_000), user, quotes)).toThrow(/fee/);
  });
});

describe("withdrawStage", () => {
  it("follows Circle's message through to the mint", () => {
    expect(withdrawStage([])).toBeNull();
    expect(withdrawStage([{ status: "pending_confirmations" }])).toEqual({ stage: "burned" });
    expect(withdrawStage([{ status: "complete", forwardState: "PENDING" }])).toEqual({ stage: "attested" });
    expect(withdrawStage([{ status: "complete", destinationMintTxHash: "0xmint" }])).toEqual({ stage: "minted", mintTx: "0xmint" });
    expect(withdrawStage([{ status: "pending_confirmations", delayReason: "insufficient_fee" }])).toEqual({
      stage: "delayed",
      reason: "insufficient_fee",
    });
  });
});
