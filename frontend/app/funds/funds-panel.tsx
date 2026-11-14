"use client";

import { useCallback, useEffect, useState } from "react";
import { erc20Abi, type Address, type Hash } from "viem";
import { baseSepolia } from "viem/chains";
import { useConnection } from "wagmi";
import { readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { CCTP, depositForBurnArgs, depositForBurnWithHookAbi, fetchFeeQuotes, maxFeeFor, type FeeQuote } from "@/lib/cctp/deposit";
import { bridgeOutArgs, fetchWithdrawFeeQuotes, fetchWithdrawStage } from "@/lib/cctp/withdraw";
import {
  HYPEREVM_USDC,
  VAULT_FACTORY,
  factoryAbi,
  formatUsdc,
  hyperCoreAccount,
  parseUsdc,
  vaultAbi,
  type HyperCoreAccount,
} from "@/lib/vault/funds";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";

const ZERO = "0x0000000000000000000000000000000000000000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (e: unknown) => (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;

type StepState = "done" | "active" | "pending";
type Step = { label: string; state: StepState; detail?: string; href?: string; mock?: boolean };

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={s.label} className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`chip ${s.state === "done" ? "chip-forest" : s.state === "active" ? "chip-amber" : ""}`}>
            {s.state === "done" ? "Done" : s.state === "active" ? "Waiting" : "Next"}
          </span>
          <span className={s.state === "pending" ? "text-ink-faint" : ""}>{s.label}</span>
          {s.mock && <span className="label-mono text-ink-faint">testnet mock</span>}
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

const short = (h: string) => `${h.slice(0, 10)}…`;
const baseTx = (h: string) => `https://sepolia.basescan.org/tx/${h}`;
const hyperEvmTx = (h: string) => `https://testnet.purrsec.com/tx/${h}`;
const inputClass = "w-full rounded-md border border-line bg-cream-raised p-3 font-mono text-sm";

export function FundsPanel() {
  const { address, status } = useConnection();
  const [vault, setVault] = useState<Address | null | undefined>(undefined);
  const [core, setCore] = useState<HyperCoreAccount | null>(null);
  const [isFlat, setIsFlat] = useState(true);
  const [evmBalance, setEvmBalance] = useState(BigInt(0));

  const refresh = useCallback(async () => {
    if (!address) return undefined;
    const v = await readContract(wagmiConfig, {
      chainId: hyperEvmTestnet.id,
      address: VAULT_FACTORY,
      abi: factoryAbi,
      functionName: "depositTargetOf",
      args: [address],
    });
    if (v === ZERO) {
      setVault(null);
      return undefined;
    }
    setVault(v);
    const [account, flat, balance] = await Promise.all([
      hyperCoreAccount(v),
      readContract(wagmiConfig, { chainId: hyperEvmTestnet.id, address: v, abi: vaultAbi, functionName: "isFlat" }),
      readContract(wagmiConfig, { chainId: hyperEvmTestnet.id, address: HYPEREVM_USDC, abi: erc20Abi, functionName: "balanceOf", args: [v] }),
    ]);
    setCore(account);
    setIsFlat(flat);
    setEvmBalance(balance);
    return { account, balance };
  }, [address]);

  useEffect(() => {
    // Poll the Vault's balances; the first read runs on the next tick, like any other.
    const tick = () => void refresh().catch(() => {});
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  if (status !== "connected" || !address) return <p className="text-sm text-ink-soft">Connect your wallet to see your Vault.</p>;
  if (vault === undefined) return <p className="text-sm text-ink-soft">Looking up your Vault…</p>;
  if (vault === null) {
    return (
      <div className="card p-6 text-sm">
        You don&apos;t have a Vault yet. Create one and sign its Mandate first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-2 p-6 text-sm">
        <p className="label-mono">Your Vault</p>
        <p className="font-mono break-all">{vault}</p>
        <p>
          Balance on HyperCore: <strong>{core ? formatUsdc(core.perpWithdrawable) : "…"}</strong>
          {core && !core.exists && " (not activated yet)"} ·{" "}
          {isFlat ? <span className="chip chip-forest">Flat</span> : <span className="chip chip-amber">Open positions</span>}
        </p>
      </section>
      <DepositCard core={core} refresh={refresh} />
      <WithdrawCard vault={vault} owner={address} core={core} isFlat={isFlat} evmBalance={evmBalance} refresh={refresh} />
    </div>
  );
}

type Refresh = () => Promise<{ account: HyperCoreAccount; balance: bigint } | undefined>;

function DepositCard({ core, refresh }: { core: HyperCoreAccount | null; refresh: Refresh }) {
  const [input, setInput] = useState("5");
  const [quotes, setQuotes] = useState<FeeQuote[] | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchFeeQuotes().then(setQuotes, (e) => setError(errorText(e)));
  }, []);

  const amount = parseUsdc(input);
  const fee = amount && quotes ? maxFeeFor(amount, quotes) : null;
  const activation = core && !core.exists ? CCTP.activationFee : BigInt(0);
  const overCap = amount !== null && amount > CCTP.maxDeposit;
  const receive = amount && fee !== null ? amount - fee - activation : null;

  async function deposit() {
    if (!amount || fee === null) return;
    setBusy(true);
    setError(null);
    const before = core?.perpWithdrawable ?? BigInt(0);
    const s: Step[] = [
      { label: "Burned on Base Sepolia", state: "active" },
      { label: "Attested by Circle", state: "pending", mock: true },
      { label: "In the Deposit Account", state: "pending", mock: true },
      { label: "In your Vault", state: "pending" },
    ];
    const show = () => setSteps(s.map((x) => ({ ...x })));
    show();
    try {
      // Fee recomputed for this transfer, just before signing.
      const maxFee = maxFeeFor(amount, await fetchFeeQuotes());
      await switchChain(wagmiConfig, { chainId: baseSepolia.id });
      const approve = await writeContract(wagmiConfig, {
        chainId: baseSepolia.id,
        address: CCTP.baseSepoliaUsdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [CCTP.depositMessenger, amount],
      });
      await waitForTransactionReceipt(wagmiConfig, { chainId: baseSepolia.id, hash: approve });
      const burn = await writeContract(wagmiConfig, {
        chainId: baseSepolia.id,
        address: CCTP.depositMessenger,
        abi: depositForBurnWithHookAbi,
        functionName: "depositForBurnWithHook",
        args: depositForBurnArgs(amount, maxFee),
      });
      await waitForTransactionReceipt(wagmiConfig, { chainId: baseSepolia.id, hash: burn });
      s[0] = { ...s[0], state: "done", detail: short(burn), href: baseTx(burn) };
      // The mock stands in for CCTP + the CctpForwarder: no attestation, the USDC is already in the Deposit Account.
      s[1] = { ...s[1], state: "done" };
      s[2] = { ...s[2], state: "done" };
      s[3] = { ...s[3], state: "active", detail: "waiting for the engine to forward it" };
      show();
      for (;;) {
        const now = await refresh();
        if (now && now.account.perpWithdrawable > before) {
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
        <h2 className="display-3">Deposit</h2>
        <p className="text-sm text-ink-soft">USDC from Base Sepolia, through CCTP, into your Vault on HyperCore.</p>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="label-mono">Amount (USDC)</span>
        <input className={inputClass} value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" />
      </label>
      {overCap && (
        <p role="alert" className="text-sm text-orange">
          Over the $1,000 testnet limit per deposit. Lower the amount.
        </p>
      )}
      {amount && fee !== null && !overCap && (
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-ink-soft">CCTP fee (at most)</dt>
          <dd className="font-mono">{formatUsdc(fee)}</dd>
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
        <button
          className="btn btn-primary"
          disabled={busy || !amount || fee === null || overCap || receive === null || receive <= BigInt(0)}
          onClick={deposit}
        >
          {busy ? "Depositing…" : "Deposit"}
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

function WithdrawCard(props: {
  vault: Address;
  owner: Address;
  core: HyperCoreAccount | null;
  isFlat: boolean;
  evmBalance: bigint;
  refresh: Refresh;
}) {
  const { vault, owner, core, isFlat, evmBalance, refresh } = props;
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const max = core?.perpWithdrawable ?? BigInt(0);
  const amount = parseUsdc(input);

  async function bridge(amountOnEvm: bigint, s: Step[], show: () => void) {
    const quotes = await fetchWithdrawFeeQuotes();
    const burn = await writeContract(wagmiConfig, {
      chainId: hyperEvmTestnet.id,
      address: vault,
      abi: vaultAbi,
      functionName: "bridgeOut",
      args: bridgeOutArgs(amountOnEvm, owner, quotes),
    });
    await waitForTransactionReceipt(wagmiConfig, { chainId: hyperEvmTestnet.id, hash: burn });
    s[1] = { ...s[1], state: "done", detail: short(burn), href: hyperEvmTx(burn) };
    s[2] = { ...s[2], state: "active" };
    show();
    for (;;) {
      const stage = await fetchWithdrawStage(burn as Hash).catch(() => null);
      if (stage?.stage === "delayed") s[2] = { ...s[2], detail: `delayed: ${stage.reason}` };
      if (stage?.stage === "attested" || stage?.stage === "minted") s[2] = { ...s[2], state: "done", detail: undefined };
      if (stage?.stage === "minted") {
        s[3] = { ...s[3], state: "done", detail: short(stage.mintTx!), href: baseTx(stage.mintTx!) };
        show();
        return;
      }
      if (s[2].state === "done") s[3] = { ...s[3], state: "active" };
      show();
      await sleep(10_000);
    }
  }

  function plan(): [Step[], () => void] {
    const s: Step[] = [
      { label: "Moved to HyperEVM", state: "active" },
      { label: "Burned on HyperEVM", state: "pending" },
      { label: "Attested by Circle", state: "pending" },
      { label: "Minted on Base Sepolia", state: "pending" },
    ];
    const show = () => setSteps(s.map((x) => ({ ...x })));
    show();
    return [s, show];
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await switchChain(wagmiConfig, { chainId: hyperEvmTestnet.id });
      await fn();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const withdraw = () =>
    run(async () => {
      if (!amount) return;
      const [s, show] = plan();
      const before = evmBalance;
      const tx = await writeContract(wagmiConfig, {
        chainId: hyperEvmTestnet.id,
        address: vault,
        abi: vaultAbi,
        functionName: "withdrawToEvm",
        args: [amount],
      });
      await waitForTransactionReceipt(wagmiConfig, { chainId: hyperEvmTestnet.id, hash: tx });
      // HyperCore credits the Vault's HyperEVM address a block or so later.
      let onEvm = before;
      while (onEvm < before + amount) {
        await sleep(3000);
        onEvm = (await refresh())?.balance ?? onEvm;
      }
      s[0] = { ...s[0], state: "done", detail: short(tx), href: hyperEvmTx(tx) };
      s[1] = { ...s[1], state: "active" };
      show();
      await bridge(onEvm, s, show);
    });

  const resume = () =>
    run(async () => {
      const [s, show] = plan();
      s[0] = { ...s[0], state: "done", detail: formatUsdc(evmBalance) };
      s[1] = { ...s[1], state: "active" };
      show();
      await bridge(evmBalance, s, show);
    });

  const tooMuch = amount !== null && amount > max;
  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">Withdraw</h2>
        <p className="text-sm text-ink-soft">
          From your Vault to your wallet on Base Sepolia. Two signatures: one moves the USDC off HyperCore, one sends it
          through CCTP.
        </p>
      </div>
      {!isFlat ? (
        <p className="text-sm">
          Your Vault has open positions. Use the Kill Switch to close them, then withdraw once the Vault is Flat.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-2 text-sm">
            <span className="label-mono">Amount (USDC) · available {formatUsdc(max)}</span>
            <input
              className={inputClass}
              value={input}
              placeholder={formatUsdc(max).replace(" USDC", "")}
              onChange={(e) => setInput(e.target.value)}
              inputMode="decimal"
            />
          </label>
          {tooMuch && (
            <p role="alert" className="text-sm text-orange">
              More than your Vault holds.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={busy || !amount || tooMuch} onClick={withdraw}>
              {busy ? "Withdrawing…" : "Withdraw"}
            </button>
            {!busy && evmBalance > BigInt(0) && (
              <button className="btn btn-secondary" onClick={resume}>
                Send {formatUsdc(evmBalance)} on to Base Sepolia
              </button>
            )}
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
