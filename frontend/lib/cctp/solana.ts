import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { type Address, type Hex, hexToBytes, padHex, toHex } from "viem";
import { CCTP, fetchFeeQuotes, maxFeeFor, type FeeQuote } from "./deposit";
import { irisMessagesApi, STANDARD_FINALITY } from "./withdraw";

// Solana devnet deposits and withdrawals (ticket #22). Same bytes as engine/src/deposits/solana.ts, pinned by the same
// golden values in test/cctp-solana.test.ts.
//
// Deposit: CCTP V2 `deposit_for_burn_with_hook` on Solana, minted to the Deposit Account on HyperEVM (testnet CCTP
// can't reach HyperCore for our testnet-only accounts), hook data = the Vault. The engine relays it and moves the USDC
// into the Vault on HyperCore.
// Withdraw: `bridgeOut(amount, 5, <user's USDC token account>, maxFee)` with Circle's forwarding, which mints on Solana.
// The token account must exist first; the UI creates it (idempotent) before the burn.

export const SOLANA = {
  domain: 5,
  rpc: "https://api.devnet.solana.com",
  usdc: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
  tokenMessengerMinter: new PublicKey("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe"),
  messageTransmitter: new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"),
  tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
} as const;

/** Anchor discriminator of `deposit_for_burn_with_hook` (token_messenger_minter_v2 IDL). */
const DEPOSIT_FOR_BURN_WITH_HOOK = [111, 245, 62, 131, 204, 108, 223, 155];

/** A user's USDC token account: the associated token account of (owner, USDC). */
export function usdcTokenAccount(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SOLANA.tokenProgram.toBuffer(), SOLANA.usdc.toBuffer()],
    SOLANA.associatedTokenProgram,
  )[0];
}

/** A Solana account as CCTP's 32-byte recipient. */
export const solanaToBytes32 = (account: PublicKey): Hex => toHex(account.toBytes());

/** Hook data naming the Vault to credit: its 20-byte address. */
export const vaultHookData = (vault: Address): Hex => vault.toLowerCase() as Hex;

export type SolanaDepositParams = {
  amount: bigint;
  destinationDomain: number;
  mintRecipient: Hex;
  destinationCaller: Hex;
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData: Hex;
};

/** The burn for a deposit into `vault`: standard finality (no protocol fee), anyone may relay it. */
export function solanaDepositParams(amount: bigint, vault: Address): SolanaDepositParams {
  return {
    amount,
    destinationDomain: CCTP.hyperEvmDomain,
    mintRecipient: padHex(CCTP.depositAccount.toLowerCase() as Hex, { size: 32 }),
    destinationCaller: padHex("0x", { size: 32 }),
    maxFee: BigInt(0),
    minFinalityThreshold: STANDARD_FINALITY,
    hookData: vaultHookData(vault),
  };
}

/** Instruction data: discriminator, then the Borsh params (little-endian ints, hookData as u32 length + bytes). */
export function encodeDepositForBurnWithHook(p: SolanaDepositParams): Uint8Array {
  const hook = hexToBytes(p.hookData);
  const out = new Uint8Array(100 + hook.length);
  const v = new DataView(out.buffer);
  out.set(DEPOSIT_FOR_BURN_WITH_HOOK, 0);
  v.setBigUint64(8, p.amount, true);
  v.setUint32(16, p.destinationDomain, true);
  out.set(hexToBytes(p.mintRecipient, { size: 32 }), 20);
  out.set(hexToBytes(p.destinationCaller, { size: 32 }), 52);
  v.setBigUint64(84, p.maxFee, true);
  v.setUint32(92, p.minFinalityThreshold, true);
  v.setUint32(96, hook.length, true);
  out.set(hook, 100);
  return out;
}

const pda = (program: PublicKey, ...seeds: (string | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(seeds.map((s) => Buffer.from(s)), program)[0];

export function depositForBurnPdas(owner: PublicKey, destinationDomain: number = CCTP.hyperEvmDomain) {
  const tmm = SOLANA.tokenMessengerMinter;
  return {
    senderAuthority: pda(tmm, "sender_authority"),
    denylist: pda(tmm, "denylist_account", owner.toBytes()),
    messageTransmitter: pda(SOLANA.messageTransmitter, "message_transmitter"),
    tokenMessenger: pda(tmm, "token_messenger"),
    remoteTokenMessenger: pda(tmm, "remote_token_messenger", String(destinationDomain)),
    tokenMinter: pda(tmm, "token_minter"),
    localToken: pda(tmm, "local_token", SOLANA.usdc.toBytes()),
    eventAuthority: pda(tmm, "__event_authority"),
  };
}

const acc = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });

/** `deposit_for_burn_with_hook` from `owner`'s USDC token account. `eventAccount` is a fresh keypair that also signs. */
export function depositForBurnWithHookInstruction(owner: PublicKey, eventAccount: PublicKey, params: SolanaDepositParams) {
  const p = depositForBurnPdas(owner, params.destinationDomain);
  return new TransactionInstruction({
    programId: SOLANA.tokenMessengerMinter,
    keys: [
      acc(owner, false, true),
      acc(owner, true, true), // event rent payer
      acc(p.senderAuthority),
      acc(usdcTokenAccount(owner), true),
      acc(p.denylist),
      acc(p.messageTransmitter, true),
      acc(p.tokenMessenger),
      acc(p.remoteTokenMessenger),
      acc(p.tokenMinter),
      acc(p.localToken, true),
      acc(SOLANA.usdc, true),
      acc(eventAccount, true, true),
      acc(SOLANA.messageTransmitter),
      acc(SOLANA.tokenMessengerMinter),
      acc(SOLANA.tokenProgram),
      acc(SystemProgram.programId),
      acc(p.eventAuthority),
      acc(SOLANA.tokenMessengerMinter),
    ],
    data: Buffer.from(encodeDepositForBurnWithHook(params)),
  });
}

/** Creates `owner`'s USDC token account if missing (associated token program `CreateIdempotent`). */
export function createUsdcTokenAccountInstruction(payer: PublicKey, owner: PublicKey) {
  return new TransactionInstruction({
    programId: SOLANA.associatedTokenProgram,
    keys: [acc(payer, true, true), acc(usdcTokenAccount(owner), true), acc(owner), acc(SOLANA.usdc), acc(SystemProgram.programId), acc(SOLANA.tokenProgram)],
    data: Buffer.from([1]),
  });
}

export function fetchSolanaWithdrawFeeQuotes(fetchFn: typeof fetch = fetch): Promise<FeeQuote[]> {
  return fetchFeeQuotes(fetchFn, { from: CCTP.hyperEvmDomain, to: SOLANA.domain, hyperCoreDeposit: false });
}

/** `bridgeOut` arguments for a withdrawal to `owner`'s USDC token account on Solana. */
export function solanaBridgeOutArgs(amount: bigint, owner: PublicKey, quotes: FeeQuote[]) {
  const maxFee = maxFeeFor(amount, quotes, STANDARD_FINALITY);
  if (maxFee >= amount) throw new Error("Withdrawal doesn't cover the CCTP forwarding fee");
  return [amount, SOLANA.domain, solanaToBytes32(usdcTokenAccount(owner)), maxFee] as const;
}

/** Whether Circle has attested a Solana burn (by its transaction signature). */
export async function fetchSolanaBurnAttested(signature: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchFn(`${irisMessagesApi}/${SOLANA.domain}?transactionHash=${signature}`);
  if (!res.ok) return false;
  const m = ((await res.json()) as { messages?: { status?: string }[] }).messages?.[0];
  return m?.status === "complete";
}

export const solanaTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
