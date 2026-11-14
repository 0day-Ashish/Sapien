"use client";

import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useConnection as useSolanaConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, type PublicKey, Transaction } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import {
  createUsdcTokenAccountInstruction,
  depositForBurnWithHookInstruction,
  fetchSolanaBurnAttested,
  solanaDepositParams,
  solanaTx,
  usdcTokenAccount,
} from "@/lib/cctp/solana";
import { CCTP } from "@/lib/cctp/deposit";
import { formatUsdc, parseUsdc, type HyperCoreAccount } from "@/lib/vault/funds";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (e: unknown) => (e as Error).message;
const inputClass = "w-full rounded-md border border-line bg-cream-raised p-3 font-mono text-sm";
const short = (s: string) => `${s.slice(0, 10)}…`;

export type Step = { label: string; state: "done" | "active" | "pending"; detail?: string; href?: string };

/** The connected Solana wallet's devnet USDC balance (subunits), polled. */
export function useSolanaUsdc(owner: PublicKey | null) {
  const { connection } = useSolanaConnection();
  const [balance, setBalance] = useState<bigint | null>(null);
  const read = useCallback(async () => {
    if (!owner) return null;
    const b = await connection
      .getTokenAccountBalance(usdcTokenAccount(owner))
      .then((r) => BigInt(r.value.amount))
      .catch(() => BigInt(0)); // no token account yet
    setBalance(b);
    return b;
  }, [connection, owner]);
  useEffect(() => {
    const tick = () => void read().catch(() => {});
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [read]);
  return { balance: owner ? balance : null, read };
}

/** Connect or disconnect a Solana wallet. */
export function SolanaWallet() {
  const { wallets, wallet, publicKey, select, disconnect, connecting } = useWallet();
  const { balance } = useSolanaUsdc(publicKey);
  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed);

  if (publicKey) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="chip chip-forest">Solana devnet</span>
        <span className="font-mono">
          {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)} · {wallet?.adapter.name}
        </span>
        <span className="font-mono text-ink-soft">{balance === null ? "…" : formatUsdc(balance)}</span>
        <button className="btn btn-secondary" onClick={() => void disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }
  if (installed.length === 0) {
    return <p className="text-sm text-ink-soft">Install a Solana wallet (Phantom, Solflare) to deposit from or withdraw to Solana devnet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-3">
      {installed.map((w) => (
        <button key={w.adapter.name} className="btn btn-secondary" disabled={connecting} onClick={() => select(w.adapter.name)}>
          Connect {w.adapter.name}
        </button>
      ))}
    </div>
  );
}

/** Sends `tx` from the connected wallet and waits for confirmation. Extra signers (the CCTP event account) co-sign. */
export function useSendSolana() {
  const { connection } = useSolanaConnection();
  const { sendTransaction } = useWallet();
  return useCallback(
    async (tx: Transaction, signers: Keypair[] = []) => {
      const latest = await connection.getLatestBlockhash();
      const signature = await sendTransaction(tx, connection, { signers });
      const r = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      if (r.value.err) throw new Error(`Solana transaction failed: ${signature}`);
      return signature;
    },
    [connection, sendTransaction],
  );
}

/** Creates the user's USDC token account on Solana if it doesn't exist yet (withdrawals mint there). */
export function useEnsureUsdcAccount() {
  const { connection } = useSolanaConnection();
  const { publicKey } = useWallet();
  const send = useSendSolana();
  return useCallback(async () => {
    if (!publicKey) throw new Error("Connect a Solana wallet");
    if (await connection.getAccountInfo(usdcTokenAccount(publicKey))) return null;
    return send(new Transaction().add(createUsdcTokenAccountInstruction(publicKey, publicKey)));
  }, [connection, publicKey, send]);
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={s.label} className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`chip ${s.state === "done" ? "chip-forest" : s.state === "active" ? "chip-amber" : ""}`}>
            {s.state === "done" ? "Done" : s.state === "active" ? "Waiting" : "Next"}
          </span>
          <span className={s.state === "pending" ? "text-ink-faint" : ""}>{s.label}</span>
          {s.href ? (
            <a className="font-mono text-xs text-violet underline" href={s.href} target="_blank" rel="noreferrer">
              {s.detail}
            </a>
          ) : (
            s.detail && <span className="font-mono text-xs text-ink-soft">{s.detail}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Deposit devnet USDC from Solana: real CCTP V2 to the Deposit Account on HyperEVM, then the engine credits the Vault. */
export function SolanaDepositCard(props: { vault: Address; core: HyperCoreAccount | null; refresh: () => Promise<{ account: HyperCoreAccount } | undefined> }) {
  const { vault, core, refresh } = props;
  const { publicKey } = useWallet();
  const { balance, read } = useSolanaUsdc(publicKey);
  const send = useSendSolana();
  const [input, setInput] = useState("5");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = parseUsdc(input);
  const activation = core && !core.exists ? CCTP.activationFee : BigInt(0);
  const receive = amount ? amount - activation : null;
  const tooMuch = amount !== null && balance !== null && amount > balance;

  async function deposit() {
    if (!amount || !publicKey) return;
    setBusy(true);
    setError(null);
    const before = core?.perpWithdrawable ?? BigInt(0);
    const s: Step[] = [
      { label: "Burned on Solana devnet", state: "active" },
      { label: "Attested by Circle", state: "pending" },
      { label: "Relayed to the Deposit Account", state: "pending" },
      { label: "In your Vault", state: "pending" },
    ];
    const show = () => setSteps(s.map((x) => ({ ...x })));
    show();
    try {
      const event = Keypair.generate();
      const ix = depositForBurnWithHookInstruction(publicKey, event.publicKey, solanaDepositParams(amount, vault));
      const signature = await send(new Transaction().add(ix), [event]);
      s[0] = { ...s[0], state: "done", detail: short(signature), href: solanaTx(signature) };
      s[1] = { ...s[1], state: "active", detail: "Solana finality, then Circle (a few minutes)" };
      show();
      void read();
      while (!(await fetchSolanaBurnAttested(signature).catch(() => false))) await sleep(10_000);
      s[1] = { ...s[1], state: "done", detail: undefined };
      s[2] = { ...s[2], state: "active", detail: "waiting for the engine" };
      show();
      for (;;) {
        const now = await refresh();
        if (now && now.account.perpWithdrawable > before) {
          s[2] = { ...s[2], state: "done", detail: undefined };
          s[3] = { ...s[3], state: "done", detail: `+${formatUsdc(now.account.perpWithdrawable - before)}` };
          break;
        }
        await sleep(5000);
      }
      show();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">Deposit from Solana</h2>
        <p className="text-sm text-ink-soft">
          Devnet USDC through CCTP to HyperEVM, then into your Vault on HyperCore. No CCTP fee at standard finality.
        </p>
      </div>
      <SolanaWallet />
      {publicKey && (
        <>
          <label className="flex flex-col gap-2 text-sm">
            <span className="label-mono">Amount (USDC){balance !== null && ` · in wallet ${formatUsdc(balance)}`}</span>
            <input className={inputClass} value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" />
          </label>
          {tooMuch && (
            <p role="alert" className="text-sm text-orange">
              More than your wallet holds.
            </p>
          )}
          {amount && (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              {activation > BigInt(0) && (
                <>
                  <dt className="text-ink-soft">Vault activation (first deposit, once)</dt>
                  <dd className="font-mono">{formatUsdc(activation)}</dd>
                </>
              )}
              <dt className="text-ink-soft">Arrives in your Vault</dt>
              <dd className="font-mono">{receive !== null && receive > BigInt(0) ? `≈ ${formatUsdc(receive)}` : "too small"}</dd>
            </dl>
          )}
          <div>
            <button className="btn btn-primary" disabled={busy || !amount || tooMuch || receive === null || receive <= BigInt(0)} onClick={deposit}>
              {busy ? "Depositing…" : "Deposit from Solana"}
            </button>
          </div>
        </>
      )}
      {steps && <Steps steps={steps} />}
      {error && (
        <p role="alert" className="text-sm text-orange">
          {error}
        </p>
      )}
    </section>
  );
}
