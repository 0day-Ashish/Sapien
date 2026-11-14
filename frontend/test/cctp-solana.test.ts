import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { toHex } from "viem";
import {
  createUsdcTokenAccountInstruction,
  depositForBurnPdas,
  depositForBurnWithHookInstruction,
  encodeDepositForBurnWithHook,
  solanaBridgeOutArgs,
  solanaDepositParams,
  solanaToBytes32,
  usdcTokenAccount,
} from "../lib/cctp/solana";

// Same golden values as engine/test/deposit-solana.test.ts.
const OWNER = new PublicKey("9h24UcEntEsK9L7L7rXV1a1JdggSRo4Urw9bCgAE36g2");
const VAULT = "0x1a272D22CFd9b0Fbe4C2aDEC5004fEeB815E24fe";
const quotes = [{ finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 1, med: 2, high: 150_000 } }];

describe("Solana recipient derivation", () => {
  it("pins the USDC token account (the real devnet account the faucet created)", () => {
    expect(usdcTokenAccount(OWNER).toBase58()).toBe("EjTcSFkACcZXkyktxcyufiRvLSyAKD2HYi2G4XdK1W1t");
  });
  it("pins the CCTP PDAs for a burn to HyperEVM", () => {
    const p = depositForBurnPdas(OWNER);
    expect(p.remoteTokenMessenger.toBase58()).toBe("3WG7G3vPxz4a6bdBb9Xic2YL4QM84ru1YcVYskcweVHY");
    expect(p.localToken.toBase58()).toBe("7MwmWTK2R9Na6rnoSAEt5gytFmSZj9WLVdazvxvru9AU");
  });
  it("withdraws to the token account, not the wallet", () => {
    const [amount, domain, recipient, maxFee] = solanaBridgeOutArgs(BigInt(2_000_000), OWNER, quotes);
    expect([amount, domain, maxFee]).toEqual([BigInt(2_000_000), 5, BigInt(150_000)]);
    expect(recipient).toBe(toHex(new PublicKey("EjTcSFkACcZXkyktxcyufiRvLSyAKD2HYi2G4XdK1W1t").toBytes()));
    expect(recipient).not.toBe(solanaToBytes32(OWNER));
  });
  it("refuses a withdrawal the forwarding fee would eat", () => {
    expect(() => solanaBridgeOutArgs(BigInt(100_000), OWNER, quotes)).toThrow();
  });
});

describe("deposit_for_burn_with_hook", () => {
  const params = solanaDepositParams(BigInt(3_000_000), VAULT);
  it("mints to the Deposit Account, relayable by anyone, hook = Vault", () => {
    expect(params.mintRecipient).toBe("0x00000000000000000000000032c0bce52f64b99acae8bfb6bb91f8accce28036");
    expect(params.destinationCaller).toBe(`0x${"0".repeat(64)}`);
    expect(params.hookData).toBe(VAULT.toLowerCase());
    expect(params.destinationDomain).toBe(19);
  });
  it("encodes the Anchor discriminator and Borsh params", () => {
    const data = encodeDepositForBurnWithHook(params);
    expect(Array.from(data.slice(0, 8))).toEqual([111, 245, 62, 131, 204, 108, 223, 155]);
    expect(data).toHaveLength(120);
    expect(new DataView(data.buffer).getBigUint64(8, true)).toBe(BigInt(3_000_000));
    expect(new DataView(data.buffer).getUint32(96, true)).toBe(20);
  });
  it("burns from the owner's USDC token account, signed by owner and event account", () => {
    const event = Keypair.generate().publicKey;
    const ix = depositForBurnWithHookInstruction(OWNER, event, params);
    expect(ix.keys).toHaveLength(18);
    expect(ix.keys[3].pubkey.toBase58()).toBe("EjTcSFkACcZXkyktxcyufiRvLSyAKD2HYi2G4XdK1W1t");
    expect(ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())).toEqual([OWNER.toBase58(), OWNER.toBase58(), event.toBase58()]);
  });
  it("creates the token account idempotently", () => {
    const ix = createUsdcTokenAccountInstruction(OWNER, OWNER);
    expect(Array.from(ix.data)).toEqual([1]);
    expect(ix.keys[1].pubkey.toBase58()).toBe("EjTcSFkACcZXkyktxcyufiRvLSyAKD2HYi2G4XdK1W1t");
  });
});
