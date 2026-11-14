import { describe, expect, it } from "vitest";
import { formatRate, profitFees, riskTier } from "../lib/settlement/epoch";

describe("risk tier", () => {
  it("uses the FeeRouter's cut-offs", () => {
    expect(riskTier(0).key).toBe("low");
    expect(riskTier(299).key).toBe("low");
    expect(riskTier(300).key).toBe("medium");
    expect(riskTier(799).key).toBe("medium");
    expect(riskTier(800).key).toBe("high");
  });
});

describe("premium rate", () => {
  it("shows parts per million as basis points", () => {
    expect(formatRate(450)).toBe("4.5 bps");
    expect(formatRate(800)).toBe("8 bps");
    expect(formatRate(1234)).toBe("12.34 bps");
  });
  it("sums the profit fees", () => {
    expect(profitFees({ builderFee: BigInt(12), protocolFee: BigInt(3), profitPremium: BigInt(3) })).toBe(BigInt(18));
  });
});
