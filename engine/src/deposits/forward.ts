// Forwards CCTP deposits from the protocol Deposit Account to their Vault inside HyperCore (spec #1, ticket #6).
// Every deposit lands in the one Deposit Account (ADR-0004); the Vault is the depositor's deposit target on the
// VaultFactory. The first deposit activates the Vault's HyperCore account (HyperCore takes 1 USDC), after which the
// Agent Wallet registration is re-sent, because CoreWriter drops it while the account doesn't exist (#4).

import type { Address, Hex } from "viem";
import type { DepositLanded } from "../events.js";

/** HyperCore's one-time fee for activating a new account, in USDC subunits (6 decimals). */
export const ACTIVATION_FEE = 1_000_000n;

/** A `DepositForBurn` on the source chain (real TokenMessengerV2 or our MockCctpForwarder: same event). */
export type Burn = {
  /** `<txHash>:<logIndex>`, unique per burn. */
  id: string;
  depositor: Address;
  /** USDC subunits. */
  amount: bigint;
  maxFee: bigint;
  hookData: Hex;
};

export interface DepositPorts {
  /** VaultFactory.depositTargetOf, or null if the depositor has no Vault. */
  depositTargetOf(depositor: Address): Promise<Address | null>;
  /** Whether the account exists on HyperCore. */
  isActivated(account: Address): Promise<boolean>;
  /** Sends USDC (subunits) from the Deposit Account's perp balance to `to`'s perp balance. */
  sendFromDepositAccount(to: Address, amount: bigint): Promise<void>;
  /** Re-sends the Vault's Agent Wallet registration (Vault.registerAgentWallet). */
  registerAgentWallet(vault: Address): Promise<void>;
}

export type ForwardResult =
  | { status: "forwarded"; vault: Address; sent: bigint; event: DepositLanded }
  | { status: "skipped"; reason: string };

/** bytes24 "cctp-forward" | uint32 version 0 | uint32 dataLength 24 | address recipient | uint32 dex (0 = perps). */
export function decodeForwardHookData(hookData: Hex): { recipient: Address; dex: number } {
  const h = hookData.toLowerCase();
  const magic = "636374702d666f7277617264" + "0".repeat(24);
  if (h.length !== 2 + 56 * 2 || h.slice(2, 50) !== magic || h.slice(50, 58) !== "00000000" || h.slice(58, 66) !== "00000018") {
    throw new Error("Not CctpForwarder hook data");
  }
  return { recipient: `0x${h.slice(66, 106)}`, dex: parseInt(h.slice(106, 114), 16) };
}

export async function forwardDeposit(burn: Burn, depositAccount: Address, ports: DepositPorts): Promise<ForwardResult> {
  let hook: { recipient: Address; dex: number };
  try {
    hook = decodeForwardHookData(burn.hookData);
  } catch {
    return { status: "skipped", reason: "hook data isn't for the CctpForwarder" };
  }
  if (hook.recipient !== depositAccount.toLowerCase() || hook.dex !== 0) {
    return { status: "skipped", reason: "not sent to the Deposit Account's perp balance" };
  }

  const vault = await ports.depositTargetOf(burn.depositor);
  if (!vault) return { status: "skipped", reason: `depositor ${burn.depositor} has no Vault` };

  const sent = burn.amount - burn.maxFee;
  const activated = await ports.isActivated(vault);
  const fee = activated ? 0n : ACTIVATION_FEE;
  if (sent <= fee) return { status: "skipped", reason: "deposit doesn't cover the CCTP fee and Vault activation" };

  await ports.sendFromDepositAccount(vault, sent);
  if (!activated) await ports.registerAgentWallet(vault);

  return {
    status: "forwarded",
    vault,
    sent,
    event: { type: "deposit-landed", vaultId: vault, amountUsdc: Number(sent - fee) / 1e6 },
  };
}
