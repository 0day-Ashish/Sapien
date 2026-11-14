import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { type Burn, type DepositPorts, decodeForwardHookData, forwardDeposit } from "../src/deposits/forward.js";

const DEPOSIT_ACCOUNT: Address = "0x32c0bce52F64b99ACAe8Bfb6BB91F8ACcce28036";
const USER: Address = "0x00000000000000000000000000000000000000aa";
const VAULT: Address = "0x00000000000000000000000000000000000000bb";
// Same golden bytes as contracts/test/MockCctpForwarder.t.sol and frontend/test/cctp-deposit.test.ts.
const HOOK = ("0x636374702d666f72776172640000000000000000000000000000000000000018" +
  "32c0bce52f64b99acae8bfb6bb91f8accce28036" +
  "00000000") as Hex;

/** Fake ports recording what was sent and re-registered. */
function fakeDepositPorts(opts: { target?: Address | null; activated?: boolean } = {}) {
  const sends: { to: Address; amount: bigint }[] = [];
  const registered: Address[] = [];
  const ports: DepositPorts = {
    depositTargetOf: async () => (opts.target === undefined ? VAULT : opts.target),
    isActivated: async () => opts.activated ?? true,
    sendFromDepositAccount: async (to, amount) => void sends.push({ to, amount }),
    registerAgentWallet: async (vault) => void registered.push(vault),
  };
  return { ports, sends, registered };
}

const burn = (over: Partial<Burn> = {}): Burn => ({
  id: "0xabc:0",
  depositor: USER,
  amount: 10_000_000n,
  maxFee: 255_817n,
  hookData: HOOK,
  ...over,
});

describe("decodeForwardHookData", () => {
  it("reads the Deposit Account and perps from the golden bytes", () => {
    expect(decodeForwardHookData(HOOK)).toEqual({ recipient: DEPOSIT_ACCOUNT.toLowerCase(), dex: 0 });
  });
  it("rejects anything else", () => {
    expect(() => decodeForwardHookData(`${HOOK}00`)).toThrow();
    expect(() => decodeForwardHookData(`0x00${HOOK.slice(4)}`)).toThrow();
  });
});

describe("forwardDeposit", () => {
  it("credits the depositor's Vault with the amount less the CCTP fee", async () => {
    const { ports, sends, registered } = fakeDepositPorts();
    const r = await forwardDeposit(burn(), DEPOSIT_ACCOUNT, ports);
    expect(sends).toEqual([{ to: VAULT, amount: 9_744_183n }]);
    expect(registered).toEqual([]);
    expect(r).toMatchObject({ status: "forwarded", event: { type: "deposit-landed", vaultId: VAULT, amountUsdc: 9.744183 } });
  });

  it("on a Vault's first deposit, deducts the 1 USDC activation fee and re-registers the Agent Wallet", async () => {
    const { ports, sends, registered } = fakeDepositPorts({ activated: false });
    const r = await forwardDeposit(burn(), DEPOSIT_ACCOUNT, ports);
    expect(sends).toEqual([{ to: VAULT, amount: 9_744_183n }]);
    expect(registered).toEqual([VAULT]);
    expect(r).toMatchObject({ status: "forwarded", event: { amountUsdc: 8.744183 } });
  });

  it("skips a depositor with no Vault, sending nothing", async () => {
    const { ports, sends } = fakeDepositPorts({ target: null });
    expect(await forwardDeposit(burn(), DEPOSIT_ACCOUNT, ports)).toMatchObject({ status: "skipped" });
    expect(sends).toEqual([]);
  });

  it("skips hook data addressed elsewhere", async () => {
    const { ports, sends } = fakeDepositPorts();
    const other = `${HOOK.slice(0, 66)}${"11".repeat(20)}00000000` as Hex;
    expect(await forwardDeposit(burn({ hookData: other }), DEPOSIT_ACCOUNT, ports)).toMatchObject({ status: "skipped" });
    expect(sends).toEqual([]);
  });

  it("skips a first deposit too small to cover activation", async () => {
    const { ports, sends } = fakeDepositPorts({ activated: false });
    const r = await forwardDeposit(burn({ amount: 1_200_000n }), DEPOSIT_ACCOUNT, ports);
    expect(r).toMatchObject({ status: "skipped" });
    expect(sends).toEqual([]);
  });
});
