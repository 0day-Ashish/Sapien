import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { type Deposit, type DepositPorts, forwardDeposit } from "../src/deposits/forward.js";

const VAULT: Address = "0x00000000000000000000000000000000000000bb";

/** Fake ports recording what was sent and re-registered. */
function fakeDepositPorts(opts: { isVault?: boolean; activated?: boolean; registerFails?: boolean } = {}) {
  const sends: { to: Address; amount: bigint }[] = [];
  const registered: Address[] = [];
  const ports: DepositPorts = {
    isVault: async () => opts.isVault ?? true,
    isActivated: async () => opts.activated ?? true,
    sendFromDepositAccount: async (to, amount) => void sends.push({ to, amount }),
    registerAgentWallet: async (vault) => {
      if (opts.registerFails) throw new Error("rpc down");
      registered.push(vault);
    },
  };
  return { ports, sends, registered };
}

const deposit = (over: Partial<Deposit> = {}): Deposit => ({ id: "3", vault: VAULT, amount: 10_000_000n, ...over });

describe("forwardDeposit", () => {
  it("credits the Vault with the whole deposit", async () => {
    const { ports, sends, registered } = fakeDepositPorts();
    const r = await forwardDeposit(deposit(), ports);
    expect(sends).toEqual([{ to: VAULT, amount: 10_000_000n }]);
    expect(registered).toEqual([]);
    expect(r).toMatchObject({ status: "forwarded", sent: 10_000_000n, event: { type: "deposit-landed", vaultId: VAULT, amountUsdc: 10 } });
  });

  it("on a Vault's first deposit, deducts the 1 USDC activation fee and re-registers the Agent Wallet", async () => {
    const { ports, sends, registered } = fakeDepositPorts({ activated: false });
    const r = await forwardDeposit(deposit(), ports);
    expect(sends).toEqual([{ to: VAULT, amount: 10_000_000n }]);
    expect(registered).toEqual([VAULT]);
    expect(r).toMatchObject({ status: "forwarded", event: { amountUsdc: 9 } });
  });

  it("skips an address that isn't a Vault, sending nothing", async () => {
    const { ports, sends } = fakeDepositPorts({ isVault: false });
    expect(await forwardDeposit(deposit(), ports)).toMatchObject({ status: "skipped" });
    expect(sends).toEqual([]);
  });

  it("skips a first deposit too small to cover activation", async () => {
    const { ports, sends } = fakeDepositPorts({ activated: false });
    expect(await forwardDeposit(deposit({ amount: 1_000_000n }), ports)).toMatchObject({ status: "skipped" });
    expect(sends).toEqual([]);
  });

  it("reports a failed re-registration without throwing, so the money is never sent twice", async () => {
    const { ports, sends } = fakeDepositPorts({ activated: false, registerFails: true });
    const r = await forwardDeposit(deposit(), ports);
    expect(sends).toHaveLength(1);
    expect(r).toMatchObject({ status: "forwarded", warning: expect.stringContaining("rpc down") });
  });
});
