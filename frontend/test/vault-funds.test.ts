import { describe, expect, it } from "vitest";
import { formatUsdc, hyperCoreAccount, maxWithdraw, parseUsdc, usdcFromHyperCore } from "../lib/vault/funds";

describe("USDC amounts", () => {
  it("parses typed amounts into 6-decimal subunits", () => {
    expect(parseUsdc("5")).toBe(BigInt(5_000_000));
    expect(parseUsdc(" 0.255031 ")).toBe(BigInt(255_031));
    expect(parseUsdc("0")).toBeNull();
    expect(parseUsdc("1.0000001")).toBeNull();
    expect(parseUsdc("-1")).toBeNull();
    expect(parseUsdc("abc")).toBeNull();
  });

  it("truncates HyperCore balances to subunits", () => {
    expect(usdcFromHyperCore("3.74496912")).toBe(BigInt(3_744_969));
    expect(usdcFromHyperCore("2.0")).toBe(BigInt(2_000_000));
    expect(usdcFromHyperCore("0")).toBe(BigInt(0));
  });

  it("formats subunits", () => {
    expect(formatUsdc(BigInt(3_744_969))).toBe("3.744969 USDC");
    expect(formatUsdc(BigInt(2_000_000))).toBe("2 USDC");
  });
});

describe("maxWithdraw", () => {
  it("keeps back the HyperEVM transfer reserve, since sending the whole balance is dropped", () => {
    expect(maxWithdraw(BigInt(3_744_901))).toBe(BigInt(3_694_901));
    expect(maxWithdraw(BigInt(50_000))).toBe(BigInt(0));
    expect(maxWithdraw(BigInt(0))).toBe(BigInt(0));
  });
});

describe("hyperCoreAccount", () => {
  it("reads activation and withdrawable perp balance", async () => {
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const data = body.type === "userRole" ? { role: "user" } : { withdrawable: "3.745" };
      return new Response(JSON.stringify(data));
    }) as unknown as typeof fetch;
    expect(await hyperCoreAccount("0x00000000000000000000000000000000000000bb", fakeFetch)).toEqual({
      exists: true,
      perpWithdrawable: BigInt(3_745_000),
    });
  });
});
