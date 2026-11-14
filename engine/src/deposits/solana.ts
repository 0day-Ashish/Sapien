// Solana devnet deposits (#22). The depositor burns devnet USDC with CCTP V2 `deposit_for_burn_with_hook`: mint
// recipient = the Deposit Account on HyperEVM, destination caller = anyone, hook data = their Vault. Testnet CCTP
// can't reach HyperCore for testnet-only accounts, so the USDC mints on HyperEVM (real Circle attestation), the engine
// relays `receiveMessage`, and the Vault is credited from the Deposit Account on HyperCore. On mainnet the minted USDC
// moves there through CoreDepositWallet; on testnet CoreDepositWallet drops credits to accounts without mainnet state,
// so the Deposit Account's HyperCore float covers it and the USDC stays on HyperEVM.

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { type Address, getAddress, type Hex, hexToBytes, isAddress, pad, toHex } from "viem";
import type { DepositLanded } from "../events.js";
import { ACTIVATION_FEE } from "./forward.js";

export const SOLANA_DOMAIN = 5;
export const HYPEREVM_DOMAIN = 19;
export const TOKEN_MESSENGER_MINTER_V2 = new PublicKey("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe");
export const MESSAGE_TRANSMITTER_V2 = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
export const DEVNET_USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
/** Anchor discriminator of `deposit_for_burn_with_hook` (token_messenger_minter_v2 IDL). */
export const DEPOSIT_FOR_BURN_WITH_HOOK = Uint8Array.from([111, 245, 62, 131, 204, 108, 223, 155]);
/** Standard finality: no CCTP protocol fee, so maxFee can be 0. */
export const STANDARD_FINALITY = 2000;

const ZERO32 = pad("0x", { size: 32 });

export type DepositForBurnWithHookParams = {
  amount: bigint;
  destinationDomain: number;
  mintRecipient: Hex; // 32 bytes
  destinationCaller: Hex; // 32 bytes
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData: Hex;
};

/** A Solana burn read from a devnet transaction. */
export type SolanaBurn = DepositForBurnWithHookParams & {
  /** The transaction signature (base58), unique per burn. */
  id: string;
  /** The burning wallet (base58). */
  depositor: string;
};

/** Instruction data: discriminator, then the Borsh params struct (little-endian ints, hookData as u32 len + bytes). */
export function encodeDepositForBurnWithHook(p: DepositForBurnWithHookParams): Uint8Array {
  const hook = hexToBytes(p.hookData);
  const out = new Uint8Array(8 + 8 + 4 + 32 + 32 + 8 + 4 + 4 + hook.length);
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

export function decodeDepositForBurnWithHook(data: Uint8Array): DepositForBurnWithHookParams | null {
  if (data.length < 100 || !DEPOSIT_FOR_BURN_WITH_HOOK.every((b, i) => data[i] === b)) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const hookLen = v.getUint32(96, true);
  if (data.length !== 100 + hookLen) return null;
  return {
    amount: v.getBigUint64(8, true),
    destinationDomain: v.getUint32(16, true),
    mintRecipient: toHex(data.slice(20, 52)),
    destinationCaller: toHex(data.slice(52, 84)),
    maxFee: v.getBigUint64(84, true),
    minFinalityThreshold: v.getUint32(92, true),
    hookData: toHex(data.slice(100)),
  };
}

/** Hook data naming the Vault to credit: its 20-byte address, nothing else. */
export const vaultHookData = (vault: Address): Hex => vault.toLowerCase() as Hex;

export function decodeVaultHookData(hookData: Hex): Address | null {
  return hookData.length === 42 && isAddress(hookData, { strict: false }) ? getAddress(hookData) : null;
}

/** A user's USDC token account: the associated token account of (owner, mint). Withdrawals mint here. */
export function usdcTokenAccount(owner: PublicKey, mint = DEVNET_USDC): PublicKey {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM)[0];
}

/** CCTP 32-byte form of a Solana account (for a withdrawal's mint recipient). */
export const solanaToBytes32 = (account: PublicKey): Hex => toHex(account.toBytes());

const tmm = (...seeds: (string | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(seeds.map((s) => (typeof s === "string" ? Buffer.from(s) : Buffer.from(s))), TOKEN_MESSENGER_MINTER_V2)[0];

/** The PDAs `deposit_for_burn_with_hook` takes, for a burn of `mint` to `destinationDomain`. */
export function depositForBurnPdas(owner: PublicKey, destinationDomain = HYPEREVM_DOMAIN, mint = DEVNET_USDC) {
  return {
    senderAuthority: tmm("sender_authority"),
    denylist: tmm("denylist_account", owner.toBytes()),
    messageTransmitter: PublicKey.findProgramAddressSync([Buffer.from("message_transmitter")], MESSAGE_TRANSMITTER_V2)[0],
    tokenMessenger: tmm("token_messenger"),
    remoteTokenMessenger: tmm("remote_token_messenger", String(destinationDomain)),
    tokenMinter: tmm("token_minter"),
    localToken: tmm("local_token", mint.toBytes()),
    eventAuthority: tmm("__event_authority"),
  };
}

/** `deposit_for_burn_with_hook` from `owner`'s USDC token account. `eventAccount` is a fresh keypair that also signs. */
export function depositForBurnWithHookInstruction(owner: PublicKey, eventAccount: PublicKey, params: DepositForBurnWithHookParams, mint = DEVNET_USDC) {
  const p = depositForBurnPdas(owner, params.destinationDomain, mint);
  const acc = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  return new TransactionInstruction({
    programId: TOKEN_MESSENGER_MINTER_V2,
    keys: [
      acc(owner, false, true),
      acc(owner, true, true), // event rent payer
      acc(p.senderAuthority),
      acc(usdcTokenAccount(owner, mint), true),
      acc(p.denylist),
      acc(p.messageTransmitter, true),
      acc(p.tokenMessenger),
      acc(p.remoteTokenMessenger),
      acc(p.tokenMinter),
      acc(p.localToken, true),
      acc(mint, true),
      acc(eventAccount, true, true),
      acc(MESSAGE_TRANSMITTER_V2),
      acc(TOKEN_MESSENGER_MINTER_V2),
      acc(TOKEN_PROGRAM),
      acc(SystemProgram.programId),
      acc(p.eventAuthority),
      acc(TOKEN_MESSENGER_MINTER_V2),
    ],
    data: Buffer.from(encodeDepositForBurnWithHook(params)),
  });
}

/** Creates `owner`'s USDC token account if missing (associated token program `CreateIdempotent`). */
export function createUsdcTokenAccountInstruction(payer: PublicKey, owner: PublicKey, mint = DEVNET_USDC) {
  const acc = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM,
    keys: [acc(payer, true, true), acc(usdcTokenAccount(owner, mint), true), acc(owner), acc(mint), acc(SystemProgram.programId), acc(TOKEN_PROGRAM)],
    data: Buffer.from([1]),
  });
}

/** The fields of a CCTP V2 burn message the engine needs (header + BurnMessageV2 body at offset 148). */
export function decodeBurnMessage(message: Hex) {
  const b = hexToBytes(message);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const word = (at: number) => toHex(b.slice(at, at + 32));
  const uint = (at: number) => BigInt(word(at));
  const body = 148;
  return {
    sourceDomain: v.getUint32(4),
    destinationDomain: v.getUint32(8),
    nonce: word(12),
    mintRecipient: word(body + 36),
    amount: uint(body + 68),
    messageSender: word(body + 100),
    feeExecuted: uint(body + 164),
    hookData: toHex(b.slice(body + 228)),
  };
}

export interface SolanaDepositPorts {
  /** VaultFactory.isVault. */
  isVault(vault: Address): Promise<boolean>;
  /**
   * Fetches the burn's attested message and calls `receiveMessage` on HyperEVM unless its nonce is already used.
   * Returns null while Circle hasn't attested it yet.
   */
  relay(burnId: string): Promise<{ message: Hex } | null>;
  /** Whether the account exists on HyperCore. */
  isActivated(account: Address): Promise<boolean>;
  /** Moves the Deposit Account's HyperEVM USDC (subunits) into its own HyperCore perp balance (CoreDepositWallet; no-op on testnet). */
  depositToCore(amount: bigint): Promise<void>;
  /** Sends USDC (subunits) from the Deposit Account's perp balance to `to`'s perp balance (activates a new Vault). */
  sendFromDepositAccount(to: Address, amount: bigint): Promise<void>;
  /** Re-sends the Vault's Agent Wallet registration. */
  registerAgentWallet(vault: Address): Promise<void>;
}

export type SolanaForwardResult =
  | { status: "forwarded"; vault: Address; sent: bigint; event: DepositLanded }
  | { status: "pending" }
  | { status: "skipped"; reason: string };

/** Relays one Solana burn and credits its Vault. Burns not addressed to the Deposit Account are skipped untouched. */
export async function forwardSolanaDeposit(burn: SolanaBurn, depositAccount: Address, ports: SolanaDepositPorts): Promise<SolanaForwardResult> {
  if (burn.destinationDomain !== HYPEREVM_DOMAIN || burn.mintRecipient.toLowerCase() !== pad(depositAccount.toLowerCase() as Hex, { size: 32 })) {
    return { status: "skipped", reason: "not minted to the Deposit Account on HyperEVM" };
  }
  if (burn.destinationCaller !== ZERO32) return { status: "skipped", reason: "destination caller set: the engine can't relay it" };
  const vault = decodeVaultHookData(burn.hookData);
  if (!vault || !(await ports.isVault(vault))) return { status: "skipped", reason: `hook data ${burn.hookData} isn't a Vault` };

  const relayed = await ports.relay(burn.id);
  if (!relayed) return { status: "pending" };
  const msg = decodeBurnMessage(relayed.message);
  const minted = msg.amount - msg.feeExecuted;

  const activated = await ports.isActivated(vault);
  const fee = activated ? 0n : ACTIVATION_FEE;
  if (minted <= fee) return { status: "skipped", reason: "deposit doesn't cover Vault activation" };

  await ports.depositToCore(minted);
  await ports.sendFromDepositAccount(vault, minted);
  if (!activated) await ports.registerAgentWallet(vault);
  return {
    status: "forwarded",
    vault,
    sent: minted,
    event: { type: "deposit-landed", vaultId: vault, amountUsdc: Number(minted - fee) / 1e6 },
  };
}
