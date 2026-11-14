// Forwards deposits from the protocol Deposit Account to their Vault inside HyperCore (spec #1, ticket #6).
// A user deposits test USDC into the Sapien Contract on NEAR; the contract records `{id, account, evm_vault, amount}`.
// On testnet the Deposit Account holds a float on HyperCore that stands in for the bridged USDC, and the engine
// credits the Vault from it (mainnet: a NEAR Intents deposit address pays the Deposit Account, ADR-0007). The first
// deposit activates the Vault's HyperCore account (HyperCore takes 1 USDC), after which the Agent Wallet
// registration is re-sent, because CoreWriter drops it while the account doesn't exist (#4).

import type { Address } from "viem";
import type { DepositLanded } from "../events.js";

/** HyperCore's one-time fee for activating a new account, in USDC subunits (6 decimals). */
export const ACTIVATION_FEE = 1_000_000n;

/** A deposit read from the Sapien Contract. */
export type Deposit = {
  /** The contract's deposit id, unique and ascending. */
  id: string;
  /** The HyperEVM Vault the depositor's NEAR account is bound to. */
  vault: Address;
  /** USDC subunits. */
  amount: bigint;
};

export interface DepositPorts {
  /** Whether `vault` is a real Vault (created by our VaultFactory), as opposed to e.g. a dummy address. */
  isVault(vault: Address): Promise<boolean>;
  /** Whether the account exists on HyperCore. */
  isActivated(account: Address): Promise<boolean>;
  /** Sends USDC (subunits) from the Deposit Account's perp balance to `to`'s perp balance. */
  sendFromDepositAccount(to: Address, amount: bigint): Promise<void>;
  /** Re-sends the Vault's Agent Wallet registration (Vault.registerAgentWallet). */
  registerAgentWallet(vault: Address): Promise<void>;
}

export type ForwardResult =
  | { status: "forwarded"; vault: Address; sent: bigint; event: DepositLanded; warning?: string }
  | { status: "skipped"; reason: string };

export async function forwardDeposit(deposit: Deposit, ports: DepositPorts): Promise<ForwardResult> {
  if (!(await ports.isVault(deposit.vault))) return { status: "skipped", reason: `${deposit.vault} isn't a Vault` };

  const activated = await ports.isActivated(deposit.vault);
  const fee = activated ? 0n : ACTIVATION_FEE;
  if (deposit.amount <= fee) return { status: "skipped", reason: "deposit doesn't cover the Vault's activation" };

  await ports.sendFromDepositAccount(deposit.vault, deposit.amount);
  // The money is already sent: a failed re-registration is reported, not thrown, so the deposit is never sent twice.
  let warning: string | undefined;
  if (!activated) await ports.registerAgentWallet(deposit.vault).catch((e) => void (warning = `Agent Wallet not re-registered: ${(e as Error).message}`));

  return {
    status: "forwarded",
    vault: deposit.vault,
    sent: deposit.amount,
    event: { type: "deposit-landed", vaultId: deposit.vault, amountUsdc: Number(deposit.amount - fee) / 1e6 },
    ...(warning ? { warning } : {}),
  };
}
