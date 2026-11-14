import { describe, expect, it } from "vitest";
import { CCTP, addressToBytes32, depositForBurnArgs, encodeForwardHookData, maxFeeFor } from "../lib/cctp/deposit";

// Same golden bytes as contracts/test/MockCctpForwarder.t.sol.
const GOLDEN_HOOK =
  "0x636374702d666f72776172640000000000000000000000000000000000000018" +
  "32c0bce52f64b99acae8bfb6bb91f8accce28036" +
  "00000000";

describe("CCTP hook data", () => {
  it("encodes the Deposit Account into perps exactly", () => {
    const hook = encodeForwardHookData(CCTP.depositAccount);
    expect(hook).toBe(GOLDEN_HOOK);
    expect((hook.length - 2) / 2).toBe(56);
  });

  it("writes the spot dex as big-endian 0xffffffff", () => {
    expect(encodeForwardHookData(CCTP.depositAccount, 0xffffffff).endsWith("ffffffff")).toBe(true);
  });

  it("rejects a malformed recipient or dex", () => {
    expect(() => encodeForwardHookData("0x1234")).toThrow();
    expect(() => encodeForwardHookData(CCTP.depositAccount, -1)).toThrow();
  });
});

describe("mint recipient", () => {
  it("is the forwarder left-padded to 32 bytes", () => {
    expect(addressToBytes32(CCTP.cctpForwarder)).toBe(
      "0x00000000000000000000000002e39ecb8368b41bf68ff99ff351ac9864e5e2a2",
    );
  });

  it("is the forwarder for both mintRecipient and destinationCaller", () => {
    const [, domain, mintRecipient, burnToken, destinationCaller, , finality, hook] = depositForBurnArgs(
      BigInt(10_000_000),
      BigInt(300_000),
    );
    expect(domain).toBe(19);
    expect(mintRecipient).toBe(addressToBytes32(CCTP.cctpForwarder));
    expect(destinationCaller).toBe(mintRecipient);
    expect(burnToken).toBe(CCTP.baseSepoliaUsdc);
    expect(finality).toBe(1000);
    expect(hook).toBe(GOLDEN_HOOK);
  });
});

describe("fees and limits", () => {
  const quotes = [
    { finalityThreshold: 1000, minimumFee: 1.3, forwardFee: { low: 229081, med: 241799, high: 254517 } },
    { finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 229081, med: 241799, high: 254517 } },
  ];

  it("adds the protocol fee (bps, rounded up) to the high forwarding fee", () => {
    // 100 USDC * 1.3 bps = 0.013 USDC = 13_000
    expect(maxFeeFor(BigInt(100_000_000), quotes)).toBe(BigInt(13_000) + BigInt(254_517));
    // 1 subunit still pays 1 subunit of protocol fee
    expect(maxFeeFor(BigInt(1), quotes)).toBe(BigInt(1) + BigInt(254_517));
    expect(maxFeeFor(BigInt(100_000_000), quotes, 2000)).toBe(BigInt(254_517));
  });

  it("refuses deposits over the testnet cap or that can't cover the fee", () => {
    expect(() => depositForBurnArgs(CCTP.maxDeposit + BigInt(1), BigInt(0))).toThrow(/cap/);
    expect(() => depositForBurnArgs(BigInt(200_000), BigInt(254_517))).toThrow(/fee/);
  });
});
