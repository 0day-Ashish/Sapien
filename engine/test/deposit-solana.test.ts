import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { type Address, concat, getAddress, type Hex, pad, toHex } from "viem";
import {
  decodeBurnMessage,
  decodeDepositForBurnWithHook,
  decodeVaultHookData,
  depositForBurnPdas,
  encodeDepositForBurnWithHook,
  forwardSolanaDeposit,
  type SolanaBurn,
  type SolanaDepositPorts,
  solanaToBytes32,
  usdcTokenAccount,
  vaultHookData,
} from "../src/deposits/solana.js";

const DEPOSIT_ACCOUNT: Address = "0x32c0bce52F64b99ACAe8Bfb6BB91F8ACcce28036";
const VAULT: Address = getAddress("0x00000000000000000000000000000000000000bb");
const OWNER = new PublicKey("9h24UcEntEsK9L7L7rXV1a1JdggSRo4Urw9bCgAE36g2");
const ZERO32 = pad("0x", { size: 32 });

const burn = (over: Partial<SolanaBurn> = {}): SolanaBurn => ({
  id: "sig1",
  depositor: OWNER.toBase58(),
  amount: 5_000_000n,
  destinationDomain: 19,
  mintRecipient: pad(DEPOSIT_ACCOUNT.toLowerCase() as Hex, { size: 32 }),
  destinationCaller: ZERO32,
  maxFee: 0n,
  minFinalityThreshold: 2000,
  hookData: vaultHookData(VAULT),
  ...over,
});

/** A CCTP V2 message: 148-byte header, then BurnMessageV2 with the given amount, fee and hook. */
function message(amount: bigint, feeExecuted: bigint, hook: Hex): Hex {
  const u32 = (n: number) => pad(toHex(n), { size: 4 });
  const w = (n: bigint) => pad(toHex(n), { size: 32 });
  const header = concat([u32(1), u32(5), u32(19), w(7n), ZERO32, ZERO32, ZERO32, u32(2000), u32(2000)]);
  const body = concat([u32(1), ZERO32, pad(DEPOSIT_ACCOUNT.toLowerCase() as Hex, { size: 32 }), w(amount), solanaToBytes32(OWNER), w(0n), w(feeExecuted), w(0n), hook]);
  return concat([header, body]);
}

function fakePorts(opts: { vault?: boolean; attested?: boolean; activated?: boolean; fee?: bigint } = {}) {
  const deposits: { vault: Address; amount: bigint }[] = [];
  const registered: Address[] = [];
  const ports: SolanaDepositPorts = {
    isVault: async () => opts.vault ?? true,
    relay: async () => (opts.attested === false ? null : { message: message(5_000_000n, opts.fee ?? 0n, vaultHookData(VAULT)) }),
    isActivated: async () => opts.activated ?? true,
    depositToCore: async (amount) => void deposits.push({ vault: DEPOSIT_ACCOUNT, amount }),
    sendFromDepositAccount: async (vault, amount) => void deposits.push({ vault, amount }),
    registerAgentWallet: async (v) => void registered.push(v),
  };
  return { ports, deposits, registered };
}

describe("Solana recipient derivation", () => {
  it("pins the USDC token account (the real devnet account the faucet created)", () => {
    expect(usdcTokenAccount(OWNER).toBase58()).toBe("EjTcSFkACcZXkyktxcyufiRvLSyAKD2HYi2G4XdK1W1t");
  });
  it("pins the CCTP PDAs for a burn to HyperEVM (matches `solana find-program-derived-address`)", () => {
    const p = depositForBurnPdas(OWNER);
    expect(p.remoteTokenMessenger.toBase58()).toBe("3WG7G3vPxz4a6bdBb9Xic2YL4QM84ru1YcVYskcweVHY");
    expect(p.localToken.toBase58()).toBe("7MwmWTK2R9Na6rnoSAEt5gytFmSZj9WLVdazvxvru9AU");
  });
  it("encodes a Solana account as its 32 raw bytes for a withdrawal's mint recipient", () => {
    expect(solanaToBytes32(usdcTokenAccount(OWNER))).toBe(toHex(usdcTokenAccount(OWNER).toBytes()));
    expect(solanaToBytes32(usdcTokenAccount(OWNER))).toHaveLength(66);
  });
});

describe("deposit_for_burn_with_hook data", () => {
  it("round-trips and starts with the Anchor discriminator", () => {
    const { id: _id, depositor: _d, ...params } = burn();
    const data = encodeDepositForBurnWithHook(params);
    expect(Array.from(data.slice(0, 8))).toEqual([111, 245, 62, 131, 204, 108, 223, 155]);
    expect(data).toHaveLength(100 + 20);
    expect(decodeDepositForBurnWithHook(data)).toEqual(params);
  });
  it("rejects other instructions", () => {
    expect(decodeDepositForBurnWithHook(new Uint8Array(120))).toBeNull();
  });
  it("names the Vault in hook data", () => {
    expect(decodeVaultHookData(vaultHookData(VAULT))).toBe(VAULT);
    expect(decodeVaultHookData("0x1234")).toBeNull();
  });
});

describe("decodeBurnMessage", () => {
  it("reads amount, fee, sender and hook from a V2 message", () => {
    const m = decodeBurnMessage(message(5_000_000n, 500n, vaultHookData(VAULT)));
    expect(m).toMatchObject({ sourceDomain: 5, destinationDomain: 19, amount: 5_000_000n, feeExecuted: 500n, messageSender: solanaToBytes32(OWNER) });
    expect(decodeVaultHookData(m.hookData)).toBe(VAULT);
  });
});

describe("forwardSolanaDeposit", () => {
  it("relays, moves the minted amount into the Deposit Account on HyperCore, then sends it to the Vault", async () => {
    const { ports, deposits, registered } = fakePorts({ fee: 500n });
    const r = await forwardSolanaDeposit(burn(), DEPOSIT_ACCOUNT, ports);
    expect(deposits).toEqual([
      { vault: DEPOSIT_ACCOUNT, amount: 4_999_500n },
      { vault: VAULT, amount: 4_999_500n },
    ]);
    expect(registered).toEqual([]);
    expect(r).toMatchObject({ status: "forwarded", event: { type: "deposit-landed", vaultId: VAULT, amountUsdc: 4.9995 } });
  });
  it("activates a new Vault, then re-registers its Agent Wallet", async () => {
    const { ports, registered } = fakePorts({ activated: false });
    const r = await forwardSolanaDeposit(burn(), DEPOSIT_ACCOUNT, ports);
    expect(registered).toEqual([VAULT]);
    expect(r).toMatchObject({ event: { amountUsdc: 4 } });
  });
  it("waits for the attestation", async () => {
    const { ports, deposits } = fakePorts({ attested: false });
    expect(await forwardSolanaDeposit(burn(), DEPOSIT_ACCOUNT, ports)).toEqual({ status: "pending" });
    expect(deposits).toEqual([]);
  });
  it.each([
    ["another recipient", burn({ mintRecipient: pad("0x01", { size: 32 }) })],
    ["another chain", burn({ destinationDomain: 6 })],
    ["a destination caller", burn({ destinationCaller: pad("0x01", { size: 32 }) })],
    ["no Vault in the hook", burn({ hookData: "0x00" })],
  ])("skips a burn with %s", async (_, b) => {
    const { ports, deposits } = fakePorts();
    expect((await forwardSolanaDeposit(b, DEPOSIT_ACCOUNT, ports)).status).toBe("skipped");
    expect(deposits).toEqual([]);
  });
  it("skips hook data that isn't a factory Vault", async () => {
    const { ports } = fakePorts({ vault: false });
    expect((await forwardSolanaDeposit(burn(), DEPOSIT_ACCOUNT, ports)).status).toBe("skipped");
  });
});
