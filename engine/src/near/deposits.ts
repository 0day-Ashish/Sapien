// Polls the Sapien Contract for deposits and forwards each once. `config().deposits` is the next deposit id, so ids
// below it exist; the cursor is the next id to look at. A deposit that can't be forwarded (dummy Vault, too small) is
// skipped for good; one that throws (RPC or HyperCore error) stops the pass and is retried on the next.

import type { Address } from "viem";
import type { NearPort } from "../adapters/near.js";
import { type DepositPorts, forwardDeposit, type ForwardResult } from "../deposits/forward.js";
import type { StateStore } from "./state.js";

export type DepositCursor = { next: number };

export type DepositPass = { id: number; account?: string; result: ForwardResult };

export async function pollDeposits(near: NearPort, ports: DepositPorts, state: StateStore<DepositCursor>, log: (p: DepositPass) => void = () => {}) {
  const cursor = state.load();
  const { deposits } = await near.config();
  const done: DepositPass[] = [];
  for (let id = cursor.next; id < deposits; id++) {
    const d = await near.deposit(id);
    // Deposits made before the contract stored them by id stay readable as events only.
    const pass: DepositPass = d
      ? { id, account: d.account, result: await forwardDeposit({ id: String(id), vault: d.evmVault as Address, amount: d.amount }, ports) }
      : { id, result: { status: "skipped", reason: "not stored on the contract" } };
    log(pass);
    done.push(pass);
    cursor.next = id + 1;
    state.save(cursor);
  }
  return done;
}
