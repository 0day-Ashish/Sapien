// Pays withdrawals. A user asks the Sapien Contract for USDC back (`request_withdraw`); once their Vault is Flat the
// engine (the Vault's owner on testnet) moves the money out with Vault.withdrawToEvm, then tells the contract with
// `pay_withdraw(id, amount)`. Testnet mirror: the user is paid from the contract's own USDC pool, not from the
// USDC that left HyperCore (there is no bridge back to NEAR on testnet).

import type { Address } from "viem";
import type { NearPort } from "../adapters/near.js";
import type { StateStore } from "./state.js";

export interface WithdrawalPorts {
  isFlat(vault: Address): Promise<boolean>;
  /** The Vault's withdrawable perp balance on HyperCore (subunits). */
  withdrawable(vault: Address): Promise<bigint>;
  /** Vault.withdrawToEvm(amount), signed by the Vault's owner; resolves once it's included. */
  withdrawToEvm(vault: Address, amount: bigint): Promise<void>;
}

export type WithdrawalCursor = {
  /** Every id below this is Paid. */
  from: number;
  /** Ids whose money already left the Vault (id -> subunits), so a failed `pay_withdraw` retries without withdrawing twice. */
  moved: Record<string, string>;
};

export type WithdrawalPass = {
  id: number;
  result: "paid" | "pay-failed" | "not-flat" | "no-balance" | "in-flight" | "no-vault" | "already-paid";
  amount?: bigint;
};

export async function pollWithdrawals(near: NearPort, ports: WithdrawalPorts, state: StateStore<WithdrawalCursor>, log: (p: WithdrawalPass) => void = () => {}) {
  const cursor = state.load();
  const { withdrawals } = await near.config();
  const out: WithdrawalPass[] = [];
  let contiguous = true;

  async function pay(id: number, account: string, requested: bigint): Promise<WithdrawalPass> {
    const vault = (await near.vaultOf(account))?.evmVault as Address | undefined;
    if (!vault) return { id, result: "no-vault" };
    let amount = cursor.moved[id] ? BigInt(cursor.moved[id]!) : undefined;
    if (amount === undefined) {
      // Not Flat: leave it for the next tick. Open positions keep their margin.
      if (!(await ports.isFlat(vault))) return { id, result: "not-flat" };
      // Pay what the Vault can give: HyperCore silently drops a transfer larger than the balance.
      const available = await ports.withdrawable(vault);
      amount = available < requested ? available : requested;
      if (amount <= 0n) return { id, result: "no-balance" };
      await ports.withdrawToEvm(vault, amount);
      cursor.moved[id] = amount.toString();
      state.save(cursor);
    }
    if (!(await near.payWithdraw(id, amount))) return { id, result: "pay-failed", amount };
    delete cursor.moved[id];
    return { id, result: "paid", amount };
  }

  for (let id = cursor.from; id < withdrawals; id++) {
    const w = await near.withdrawal(id);
    const pass: WithdrawalPass = !w || w.status === "Paid" ? { id, result: "already-paid" } : w.status === "Paying" ? { id, result: "in-flight" } : await pay(id, w.account, w.requested);
    log(pass);
    out.push(pass);
    if (pass.result === "paid" || pass.result === "already-paid") {
      if (contiguous) cursor.from = id + 1;
    } else contiguous = false;
    state.save(cursor);
  }
  return out;
}
