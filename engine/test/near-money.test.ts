import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import type { DepositPorts } from "../src/deposits/forward.js";
import { pollDeposits, type DepositCursor } from "../src/near/deposits.js";
import { MemoryState } from "../src/near/state.js";
import { pollWithdrawals, type WithdrawalCursor, type WithdrawalPorts } from "../src/near/withdrawals.js";
import { FakeNear } from "../src/testing/near.js";

const REAL: Address = "0x00000000000000000000000000000000000000bb";
const DUMMY: Address = "0x000000000000000000000000000000000000dead";

function depositPorts() {
  const sends: { to: Address; amount: bigint }[] = [];
  const ports: DepositPorts = {
    isVault: async (v) => v === REAL,
    isActivated: async () => true,
    sendFromDepositAccount: async (to, amount) => void sends.push({ to, amount }),
    registerAgentWallet: async () => {},
  };
  return { ports, sends };
}

describe("pollDeposits", () => {
  it("forwards each deposit once, advancing the cursor, and skips a dummy Vault and ids the contract didn't store", async () => {
    const near = new FakeNear();
    near.deposits = [null, { account: "a.testnet", evmVault: DUMMY, amount: 1_000_000n, blockTimestampMs: 1 }, { account: "b.testnet", evmVault: REAL, amount: 5_000_000n, blockTimestampMs: 2 }];
    const { ports, sends } = depositPorts();
    const state = new MemoryState<DepositCursor>({ next: 0 });

    const first = await pollDeposits(near, ports, state);
    expect(first.map((p) => p.result.status)).toEqual(["skipped", "skipped", "forwarded"]);
    expect(sends).toEqual([{ to: REAL, amount: 5_000_000n }]);
    expect(state.value).toEqual({ next: 3 });

    // Nothing new: nothing is sent again.
    expect(await pollDeposits(near, ports, state)).toEqual([]);

    // A later deposit is picked up from the cursor.
    near.deposits.push({ account: "b.testnet", evmVault: REAL, amount: 2_000_000n, blockTimestampMs: 3 });
    await pollDeposits(near, ports, state);
    expect(sends).toEqual([
      { to: REAL, amount: 5_000_000n },
      { to: REAL, amount: 2_000_000n },
    ]);
    expect(state.value.next).toBe(4);
  });

  it("stops at a deposit that throws and retries it, without moving the cursor past it", async () => {
    const near = new FakeNear();
    near.deposits = [{ account: "b.testnet", evmVault: REAL, amount: 5_000_000n, blockTimestampMs: 1 }];
    const { ports, sends } = depositPorts();
    let fail = true;
    const send = ports.sendFromDepositAccount;
    ports.sendFromDepositAccount = async (to, amount) => {
      if (fail) throw new Error("HyperCore down");
      return send(to, amount);
    };
    const state = new MemoryState<DepositCursor>({ next: 0 });

    await expect(pollDeposits(near, ports, state)).rejects.toThrow("HyperCore down");
    expect(state.value.next).toBe(0);
    fail = false;
    await pollDeposits(near, ports, state);
    expect(sends).toHaveLength(1);
    expect(state.value.next).toBe(1);
  });
});

function withdrawalSetup(opts: { flat?: boolean; withdrawable?: bigint } = {}) {
  const near = new FakeNear();
  near.vaults.set("u.testnet", { evmVault: REAL, mandateHash: null, killed: false, deposited: 0n, withdrawn: 0n });
  near.withdrawals = [{ account: "u.testnet", requested: 4_000_000n, paid: 0n, status: "Requested" }];
  const moved: bigint[] = [];
  const flags = { flat: opts.flat ?? true };
  const ports: WithdrawalPorts = {
    isFlat: async () => flags.flat,
    withdrawable: async () => opts.withdrawable ?? 10_000_000n,
    withdrawToEvm: async (_v, amount) => void moved.push(amount),
  };
  return { near, ports, moved, flags, state: new MemoryState<WithdrawalCursor>({ from: 0, moved: {} }) };
}

describe("pollWithdrawals", () => {
  it("withdraws from a Flat Vault, then pays on NEAR", async () => {
    const { near, ports, moved, state } = withdrawalSetup();
    await pollWithdrawals(near, ports, state);
    expect(moved).toEqual([4_000_000n]);
    expect(near.paidWithdrawals).toEqual([{ id: 0, amount: 4_000_000n }]);
    expect(state.value.from).toBe(1);
  });

  it("leaves a withdrawal alone while the Vault isn't Flat, and pays it once Flat", async () => {
    const { near, ports, moved, flags, state } = withdrawalSetup({ flat: false });
    const r = await pollWithdrawals(near, ports, state);
    expect(r.map((p) => p.result)).toEqual(["not-flat"]);
    expect(moved).toEqual([]);
    expect(near.paidWithdrawals).toEqual([]);
    expect(state.value.from).toBe(0);

    flags.flat = true;
    await pollWithdrawals(near, ports, state);
    expect(near.paidWithdrawals).toEqual([{ id: 0, amount: 4_000_000n }]);
  });

  it("pays only what the Vault can give", async () => {
    const { near, ports, moved, state } = withdrawalSetup({ withdrawable: 2_500_000n });
    await pollWithdrawals(near, ports, state);
    expect(moved).toEqual([2_500_000n]);
    expect(near.paidWithdrawals).toEqual([{ id: 0, amount: 2_500_000n }]);
  });

  it("retries a failed pay_withdraw without withdrawing from the Vault twice", async () => {
    const { near, ports, moved, state } = withdrawalSetup();
    near.payWithdrawFails = true;
    expect((await pollWithdrawals(near, ports, state))[0]?.result).toBe("pay-failed");
    near.payWithdrawFails = false;
    await pollWithdrawals(near, ports, state);
    expect(moved).toEqual([4_000_000n]);
    expect(near.paidWithdrawals).toEqual([{ id: 0, amount: 4_000_000n }]);
    expect(state.value).toEqual({ from: 1, moved: {} });
  });

  it("skips a withdrawal already Paying or Paid", async () => {
    const { near, ports, moved, state } = withdrawalSetup();
    near.withdrawals = [
      { account: "u.testnet", requested: 1n, paid: 1n, status: "Paid" },
      { account: "u.testnet", requested: 1n, paid: 0n, status: "Paying" },
    ];
    await pollWithdrawals(near, ports, state);
    expect(moved).toEqual([]);
    expect(state.value.from).toBe(1);
  });
});
