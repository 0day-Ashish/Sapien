"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { hyperClient } from "@/lib/hyperevm";
import { formatUsdc, fromU128, toSubunits } from "@/lib/near/amount";
import { NEAR_USDC, hyperEvmAddressUrl, nearTxUrl } from "@/lib/near/config";
import { depositTx, faucetTx, requestWithdrawTx, txHash, withdrawalIdFrom } from "@/lib/near/tx";
import { usdcBalanceOf, vaultOf, withdrawalOf, type Withdrawal } from "@/lib/near/view";
import { hyperCoreAccount, vaultAbi, type HyperCoreAccount } from "@/lib/vault/funds";
import { useNearWallet } from "../near-wallet";
import { useNearVault } from "../use-near-vault";
import { IntentsQuote } from "./intents-quote";
import { KillSwitch } from "./kill-switch";
import { Steps, errorText, inputClass, shortHash, sleep, type Step } from "./steps";
import { MandateOnNear } from "./vault-mandate";
import { VaultRisk } from "./vault-risk";

const FAUCET_MAX = "1000000000"; // 1,000 USDC, the faucet's limit per call

export function FundsPanel() {
  const { accountId, send } = useNearWallet();
  const { vault, evmVault, record, create, refresh: refreshVault } = useNearVault();
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [core, setCore] = useState<HyperCoreAccount | null>(null);
  const [isFlat, setIsFlat] = useState(true);
  const [busy, setBusy] = useState<"faucet" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Reloads the NEAR USDC balance, the Vault record and the Vault's HyperCore balance. */
  const refresh = useCallback(async () => {
    if (!accountId) return undefined;
    const balance = await usdcBalanceOf(accountId).catch(() => null);
    if (balance !== null) setUsdc(fromU128(balance));
    await refreshVault();
    if (!evmVault) return undefined;
    const [account, flat] = await Promise.all([
      hyperCoreAccount(evmVault),
      hyperClient.readContract({ address: evmVault, abi: vaultAbi, functionName: "isFlat" }),
    ]);
    setCore(account);
    setIsFlat(flat);
    return account;
  }, [accountId, evmVault, refreshVault]);

  useEffect(() => {
    // Poll the balances; the first read runs on the next tick, like any other.
    const tick = () => void refresh().catch(() => {});
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  async function getTestUsdc() {
    setBusy("faucet");
    setError(null);
    try {
      await send(faucetTx(FAUCET_MAX));
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function createVault() {
    setBusy("create");
    setError(null);
    try {
      await create();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  if (!accountId) return <p className="text-sm text-ink-soft">Connect your Meteor Wallet to see your Vault.</p>;

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-3 p-6 text-sm">
        <p className="label-mono">Your NEAR wallet</p>
        <p>
          Test USDC: <strong>{usdc === null ? "…" : formatUsdc(usdc)}</strong>{" "}
          <span className="text-ink-faint">
            (<span className="font-mono">{NEAR_USDC}</span>)
          </span>
        </p>
        <div>
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void getTestUsdc()}>
            {busy === "faucet" ? "Getting USDC…" : "Get test USDC"}
          </button>
        </div>
        <p className="text-xs text-ink-soft">1,000 test USDC per click, free, and it registers your account with the token.</p>
      </section>

      {vault === undefined && <p className="text-sm text-ink-soft">Looking up your Vault…</p>}

      {vault === null && (
        <section className="card flex flex-col gap-3 p-6 text-sm">
          <h2 className="display-3">Create your Vault</h2>
          <p className="text-ink-soft">
            Your Vault is a contract on HyperEVM that trades on HyperCore. The engine creates it for your NEAR account and keeps
            its trade-only Agent Wallet key. It can trade, never withdraw.
          </p>
          <div>
            <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void createVault()}>
              {busy === "create" ? "Creating your Vault…" : "Create Vault"}
            </button>
          </div>
        </section>
      )}

      {vault && evmVault && (
        <>
          <section className="card flex flex-col gap-2 p-6 text-sm">
            <p className="label-mono">Your Vault</p>
            <a className="font-mono break-all text-violet underline" href={hyperEvmAddressUrl(evmVault)} target="_blank" rel="noreferrer">
              {evmVault}
            </a>
            <p>
              Value on HyperCore: <strong>{core ? formatUsdc(core.perpWithdrawable) : "…"}</strong>
              {core && !core.exists && " (not activated yet)"} ·{" "}
              {isFlat ? <span className="chip chip-forest">Flat</span> : <span className="chip chip-amber">Open positions</span>}
            </p>
            {record && (
              <p>
                On NEAR: <strong>{formatUsdc(fromU128(record.deposited))}</strong> deposited ·{" "}
                <strong>{formatUsdc(fromU128(record.withdrawn))}</strong> withdrawn
              </p>
            )}
          </section>
          {record && (
            <section className="card flex flex-col gap-3 p-6">
              <MandateOnNear record={record} />
            </section>
          )}
          <VaultRisk vault={evmVault} />
          <DepositCard usdc={usdc} core={core} refresh={refresh} account={accountId} />
          <WithdrawCard account={accountId} core={core} isFlat={isFlat} refresh={refresh} />
          <KillSwitch evmVault={evmVault as Address} killed={record?.killed ?? false} refresh={refresh} />
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-orange">
          {error}
        </p>
      )}
    </div>
  );
}

type Refresh = () => Promise<HyperCoreAccount | undefined>;

function DepositCard(props: { usdc: bigint | null; core: HyperCoreAccount | null; refresh: Refresh; account: string }) {
  const { usdc, core, refresh, account } = props;
  const { send } = useNearWallet();
  const [input, setInput] = useState("5");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const subunits = toSubunits(input);
  const amount = subunits ? BigInt(subunits) : null;
  const tooMuch = amount !== null && usdc !== null && amount > usdc;

  async function deposit() {
    if (!subunits || !amount) return;
    setBusy(true);
    setError(null);
    const coreBefore = core?.perpWithdrawable ?? BigInt(0);
    const s: Step[] = [
      { label: "Sent to the NEAR contract", state: "active" },
      { label: "Counted in your Vault on NEAR", state: "pending" },
      { label: "In your Vault on HyperCore", state: "pending" },
    ];
    const show = () => setSteps(s.map((x) => ({ ...x })));
    show();
    try {
      const before = fromU128((await vaultOf(account))?.deposited);
      const tx = txHash(await send(depositTx(subunits)));
      s[0] = { ...s[0], state: "done", detail: tx ? shortHash(tx) : undefined, href: tx ? nearTxUrl(tx) : undefined };
      s[1] = { ...s[1], state: "active" };
      show();
      // The contract refunds a deposit from an account with no Vault: its record only grows if it kept the USDC.
      let counted = false;
      for (let i = 0; i < 15 && !counted; i++) {
        counted = fromU128((await vaultOf(account))?.deposited) >= before + amount;
        if (!counted) await sleep(2000);
      }
      if (!counted) throw new Error("The NEAR contract didn't keep the deposit, so the USDC went back to your wallet. Create your Vault first.");
      s[1] = { ...s[1], state: "done", detail: formatUsdc(amount) };
      s[2] = { ...s[2], state: "active", detail: "waiting for the engine to forward it" };
      show();
      for (let i = 0; i < 90; i++) {
        // A failed poll (RPC or info API blip) isn't a failed deposit: try again next round.
        const now = await refresh().catch(() => undefined);
        if (now && now.perpWithdrawable > coreBefore) {
          s[2] = { ...s[2], state: "done", detail: `+${formatUsdc(now.perpWithdrawable - coreBefore)}` };
          show();
          return;
        }
        await sleep(5000);
      }
      s[2] = { ...s[2], detail: "still waiting; it appears once the engine forwards it" };
      show();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      void refresh().catch(() => {});
    }
  }

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">Deposit</h2>
        <p className="text-sm text-ink-soft">Test USDC from your NEAR wallet, through the Sapien NEAR contract, into your Vault on HyperCore.</p>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="label-mono">Amount (USDC){usdc !== null && ` · in wallet ${formatUsdc(usdc)}`}</span>
        <input className={inputClass} value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" />
      </label>
      {tooMuch && (
        <p role="alert" className="text-sm text-orange">
          More than your wallet holds. Get test USDC first.
        </p>
      )}
      <div>
        <button className="btn btn-primary" disabled={busy || !amount || tooMuch} onClick={() => void deposit()}>
          {busy ? "Depositing…" : "Deposit"}
        </button>
      </div>
      {steps && <Steps steps={steps} />}
      {error && (
        <p role="alert" className="text-sm text-orange">
          {error}
        </p>
      )}
      <IntentsQuote amount={subunits ? input.trim() : null} />
    </section>
  );
}

const pendingKey = (account: string) => `sapien.near.withdrawal.${account}`;
const rememberPending = (account: string, id: number | null) => {
  try {
    if (id === null) localStorage.removeItem(pendingKey(account));
    else localStorage.setItem(pendingKey(account), String(id));
  } catch {}
};
const recallPending = (account: string): number | null => {
  try {
    const v = localStorage.getItem(pendingKey(account));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};

function WithdrawCard(props: { account: string; core: HyperCoreAccount | null; isFlat: boolean; refresh: Refresh }) {
  const { account, core, isFlat, refresh } = props;
  const { send } = useNearWallet();
  const [input, setInput] = useState("");
  const [requestTx, setRequestTx] = useState<string | undefined>();
  const [pending, setPending] = useState<{ id: number; w: Withdrawal | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const subunits = toSubunits(input);
  const available = core?.perpWithdrawable ?? BigInt(0);

  // Pick up a withdrawal requested before a reload.
  useEffect(() => {
    const t = setTimeout(() => {
      const id = recallPending(account);
      if (id !== null) setPending((p) => p ?? { id, w: null });
    }, 0);
    return () => clearTimeout(t);
  }, [account]);

  // Poll the withdrawal until the engine has paid it.
  const pendingId = pending?.id;
  const paid = pending?.w?.status === "Paid";
  useEffect(() => {
    if (pendingId === undefined || paid) return;
    let live = true;
    const tick = async () => {
      const w = await withdrawalOf(pendingId).catch(() => null);
      if (!live || !w) return;
      setPending({ id: pendingId, w });
      if (w.status === "Paid") {
        rememberPending(account, null);
        void refresh().catch(() => {});
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pendingId, paid, account, refresh]);

  async function withdraw() {
    if (!subunits) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await send(requestWithdrawTx(subunits));
      const id = withdrawalIdFrom(outcome);
      if (id === null) throw new Error("Requested, but the wallet didn't return the withdrawal id. Check your NEAR account's activity.");
      setRequestTx(txHash(outcome));
      rememberPending(account, id);
      setPending({ id, w: null });
      setInput("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const status = pending?.w?.status;
  const steps: Step[] | null = pending
    ? [
        { label: "Requested on NEAR", state: "done", detail: requestTx ? shortHash(requestTx) : `#${pending.id}`, href: requestTx ? nearTxUrl(requestTx) : undefined },
        {
          label: isFlat ? "Engine pays from your Vault" : "Waiting for the Vault to be Flat",
          state: status === "Paid" ? "done" : "active",
          detail: status === "Paying" ? "paying" : undefined,
        },
        {
          label: "Paid to your NEAR account",
          state: status === "Paid" ? "done" : "pending",
          detail: status === "Paid" && pending.w ? formatUsdc(fromU128(pending.w.paid)) : undefined,
        },
      ]
    : null;

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">Withdraw</h2>
        <p className="text-sm text-ink-soft">
          Ask for USDC back on NEAR. The engine pays once your Vault is Flat (no open positions), then the USDC lands in your NEAR
          wallet. With open positions, use the Kill Switch below.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="label-mono">Amount (USDC) · in your Vault {core ? formatUsdc(available) : "…"}</span>
        <input className={inputClass} value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" />
      </label>
      <div>
        <button className="btn btn-primary" disabled={busy || !subunits} onClick={() => void withdraw()}>
          {busy ? "Requesting…" : "Request withdrawal"}
        </button>
      </div>
      {steps && <Steps steps={steps} />}
      {error && (
        <p role="alert" className="text-sm text-orange">
          {error}
        </p>
      )}
    </section>
  );
}
