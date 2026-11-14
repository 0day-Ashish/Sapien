import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromU128, toSubunits } from "../lib/near/amount";
import { createNearVault, fetchNearVault, postNearMandate } from "../lib/near/engine";
import { buildQuoteRequest, pickHyperCoreUsdc, quoteAmount, summarizeQuote } from "../lib/near/intents";
import { mandateHashOf, mandatePayload } from "../lib/near/mandate";
import { commitMandateTx, depositTx, faucetTx, requestWithdrawTx, setKilledTx, txHash, withdrawalIdFrom } from "../lib/near/tx";
import { decodeViewResult, encodeViewArgs, vaultOf, viewCall, viewRequest } from "../lib/near/view";
import type { Mandate } from "../lib/mandate/schema";

const mandate: Mandate = {
  vetoThresholdUsdc: 250.5,
  allowedAssets: ["ETH", "BTC"],
  blackoutWindows: [{ event: "US_CPI", start: 1_800_000_000, end: 1_800_003_600 }],
  drawdownCapPct: 12.5,
  stopLossPct: 2.25,
  leverageCap: 2.5,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("amounts", () => {
  it("parses typed USDC into 6-decimal subunit strings", () => {
    expect(toSubunits("5")).toBe("5000000");
    expect(toSubunits("1000")).toBe("1000000000");
    expect(toSubunits(" 0.000001 ")).toBe("1");
    expect(toSubunits("0")).toBeNull();
    expect(toSubunits("1.0000001")).toBeNull();
    expect(toSubunits("-2")).toBeNull();
    expect(toSubunits("")).toBeNull();
  });
  it("reads U128 strings", () => {
    expect(fromU128("2500000")).toBe(BigInt(2_500_000));
    expect(fromU128(null)).toBe(BigInt(0));
    expect(fromU128("x")).toBe(BigInt(0));
  });
});

describe("Mandate hash", () => {
  it("is sha256 of the UTF-8 of JSON.stringify(mandate), hex without 0x", () => {
    const payload = mandatePayload(mandate);
    const expected = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
    expect(mandateHashOf(payload)).toBe(expected);
    expect(mandateHashOf(payload)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("survives a JSON round trip, which is what the engine hashes", () => {
    const payload = mandatePayload(mandate);
    expect(mandateHashOf(JSON.parse(JSON.stringify(payload)))).toBe(mandateHashOf(payload));
  });
  it("fixes the field order, so the same Mandate always hashes the same", () => {
    const reordered = { ...mandate, leverageCap: 2.5, allowedAssets: ["ETH", "BTC"] } as Mandate;
    expect(JSON.stringify(mandatePayload(reordered))).toBe(JSON.stringify(mandatePayload(mandate)));
    expect(JSON.stringify(mandatePayload(mandate)).startsWith('{"allowedAssets"')).toBe(true);
  });
  it("changes with any field", () => {
    expect(mandateHashOf(mandatePayload({ ...mandate, leverageCap: 3 }))).not.toBe(mandateHashOf(mandatePayload(mandate)));
  });
});

describe("view calls", () => {
  it("base64-encodes the JSON args", () => {
    expect(encodeViewArgs({ account: "alice.testnet" })).toBe(Buffer.from('{"account":"alice.testnet"}').toString("base64"));
    expect(encodeViewArgs()).toBe("e30=");
    expect(Buffer.from(encodeViewArgs({ m: "é" }), "base64").toString("utf8")).toBe('{"m":"é"}');
  });
  it("builds a call_function query", () => {
    expect(viewRequest("c.testnet", "vault_of", { account: "a" }).params).toMatchObject({
      request_type: "call_function",
      account_id: "c.testnet",
      method_name: "vault_of",
    });
  });
  it("decodes the byte array an RPC returns", () => {
    expect(decodeViewResult<{ a: number }>([...Buffer.from('{"a":1}')])).toEqual({ a: 1 });
    expect(decodeViewResult<null>([...Buffer.from("null")])).toBeNull();
  });
  it("calls the RPC and returns the parsed value", async () => {
    let seen: { url: string; body: { params: { method_name: string } } } | undefined;
    const f = (async (url: string, init: { body: string }) => {
      seen = { url, body: JSON.parse(init.body) };
      return json({ result: { result: [...Buffer.from('{"evm_vault":"0xabc","mandate_hash":null,"killed":false,"deposited":"2","withdrawn":"1"}')] } });
    }) as unknown as typeof fetch;
    const v = await vaultOf("alice.testnet", f);
    expect(v?.deposited).toBe("2");
    expect(seen?.body.params.method_name).toBe("vault_of");
  });
  it("surfaces contract and RPC errors", async () => {
    await expect(viewCall("c", "m", {}, (async () => json({ result: { error: "wasm execution failed" } })) as unknown as typeof fetch)).rejects.toThrow("wasm execution failed");
    await expect(viewCall("c", "m", {}, (async () => json({}, 503)) as unknown as typeof fetch)).rejects.toThrow("NEAR RPC 503");
  });
});

describe("transactions", () => {
  it("deposits with ft_transfer_call and 1 yoctoNEAR", () => {
    const tx = depositTx("5000000");
    expect(tx.receiverId).toBe("usdc.sapien-vault.testnet");
    expect(tx.actions[0].params).toMatchObject({
      methodName: "ft_transfer_call",
      args: { receiver_id: "sapien-vault.testnet", amount: "5000000", msg: "" },
      deposit: "1",
    });
  });
  it("calls the contract for withdraw, Mandate and Kill Switch, and the token for the faucet", () => {
    expect(requestWithdrawTx("1").actions[0].params.args).toEqual({ amount: "1" });
    expect(commitMandateTx("ab".repeat(32)).actions[0].params.args).toEqual({ mandate_hash: "ab".repeat(32) });
    expect(setKilledTx(false).actions[0].params.args).toEqual({ killed: false });
    expect(faucetTx("1000000000").receiverId).toBe("usdc.sapien-vault.testnet");
  });
  it("reads the withdrawal id from the outcome's success value", () => {
    const ok = { status: { SuccessValue: Buffer.from("7").toString("base64") }, transaction: { hash: "H" } };
    expect(withdrawalIdFrom(ok)).toBe(7);
    expect(txHash(ok)).toBe("H");
    expect(withdrawalIdFrom({ status: { SuccessValue: "" } })).toBeNull();
    expect(withdrawalIdFrom({ status: { SuccessValue: Buffer.from('"x"').toString("base64") } })).toBeNull();
    expect(withdrawalIdFrom(undefined)).toBeNull();
  });
});

describe("engine NEAR API", () => {
  it("returns null for an account with no Vault", async () => {
    expect(await fetchNearVault("a.testnet", (async () => json({}, 404)) as unknown as typeof fetch)).toBeNull();
  });
  it("creates a Vault", async () => {
    let body = "";
    const f = (async (_u: string, init: { body: string }) => {
      body = init.body;
      return json({ account: "a.testnet", evmVault: "0x1", agentWallet: "0x2" });
    }) as unknown as typeof fetch;
    expect((await createNearVault("a.testnet", f)).evmVault).toBe("0x1");
    expect(JSON.parse(body)).toEqual({ account: "a.testnet" });
  });
  it("explains a hash mismatch", async () => {
    await expect(postNearMandate("a.testnet", {}, (async () => json({}, 409)) as unknown as typeof fetch)).rejects.toThrow("doesn't match");
  });
});

describe("NEAR Intents quote", () => {
  it("picks the 6-decimal HyperCore USDC", () => {
    const t = [
      { assetId: "a", symbol: "USDC", blockchain: "hypercore", decimals: 8 },
      { assetId: "b", symbol: "USDC", blockchain: "hypercore", decimals: 6 },
      { assetId: "c", symbol: "USDC", blockchain: "eth", decimals: 6 },
    ];
    expect(pickHyperCoreUsdc(t)?.assetId).toBe("b");
    expect(pickHyperCoreUsdc([t[2]])).toBeNull();
  });
  it("builds a dry exact-input quote to the Deposit Account, due in an hour", () => {
    const q = buildQuoteRequest({ amount: "5000000", destinationAsset: "d", now: new Date("2026-01-01T00:00:00Z") });
    expect(q).toMatchObject({
      dry: true,
      swapType: "EXACT_INPUT",
      depositType: "ORIGIN_CHAIN",
      recipientType: "DESTINATION_CHAIN",
      refundType: "ORIGIN_CHAIN",
      slippageTolerance: 100,
      recipient: "0x32c0bce52F64b99ACAe8Bfb6BB91F8ACcce28036",
      deadline: "2026-01-01T01:00:00.000Z",
    });
  });
  it("summarises amount out, fee and ETA", () => {
    expect(summarizeQuote({ quote: { amountIn: "5000000", amountOut: "4683690", timeEstimate: 30 } })).toEqual({
      amountIn: "5000000",
      amountOut: "4683690",
      fee: "316310",
      etaSeconds: 30,
    });
    expect(summarizeQuote({ message: "Internal server error" })).toBeNull();
  });
  it("validates the amount query", () => {
    expect(quoteAmount("5")).toBe("5000000");
    expect(quoteAmount("abc")).toBeNull();
    expect(quoteAmount(null)).toBeNull();
  });
});
