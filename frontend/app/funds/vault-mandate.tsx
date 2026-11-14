"use client";

import { useCallback, useEffect, useState } from "react";
import { parseEventLogs, zeroAddress, type Address, type Hash } from "viem";
import { useConnection } from "wagmi";
import { readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ENGINE_URL } from "@/lib/engine/veto";
import type { Mandate } from "@/lib/mandate/schema";
import { VAULT_FACTORY, factoryAbi, formatUsdc } from "@/lib/vault/funds";
import {
  MANDATE_REGISTRY,
  createVaultAbi,
  formatBps,
  formatLeverage,
  mandateRegistryAbi,
  signMandateArgs,
  versionHistory,
  type MandateVersion,
} from "@/lib/vault/mandate";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";

// Ticket #5: create a Vault, sign its Mandate, and show the Mandate Version history.

const chain = { chainId: hyperEvmTestnet.id } as const;
const explorerTx = (hash: Hash) => `https://testnet.purrsec.com/tx/${hash}`;

/** The connected wallet's Vault (its deposit target on the VaultFactory), null if it has none. */
export function useOwnVault() {
  const { address } = useConnection();
  const [vault, setVault] = useState<Address | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (!address) return setVault(undefined);
    const v = await readContract(wagmiConfig, { ...chain, address: VAULT_FACTORY, abi: factoryAbi, functionName: "depositTargetOf", args: [address] });
    setVault(v === zeroAddress ? null : v);
  }, [address]);
  useEffect(() => {
    const t = setTimeout(() => void refresh().catch(() => setVault(null)), 0);
    return () => clearTimeout(t);
  }, [refresh]);
  return { owner: address, vault, refresh };
}

/** A fresh Agent Wallet from the engine (it keeps the key: it can trade, never withdraw), then createVault. */
async function createVault(): Promise<{ vault: Address; tx: Hash }> {
  const res = await fetch(`${ENGINE_URL}/agent-wallets`, { method: "POST" });
  if (!res.ok) throw new Error(`The engine didn't issue an Agent Wallet (${res.status}). Is it running at ${ENGINE_URL}?`);
  const { address: agentWallet } = (await res.json()) as { address: Address };
  await switchChain(wagmiConfig, chain);
  const tx = await writeContract(wagmiConfig, { ...chain, address: VAULT_FACTORY, abi: createVaultAbi, functionName: "createVault", args: [agentWallet] });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { ...chain, hash: tx });
  const [created] = parseEventLogs({ abi: createVaultAbi, logs: receipt.logs, eventName: "VaultCreated" });
  if (receipt.status !== "success" || !created) throw new Error("createVault reverted");
  return { vault: created.args.vault, tx };
}

async function signMandate(vault: Address, mandate: Mandate): Promise<Hash> {
  await switchChain(wagmiConfig, chain);
  const tx = await writeContract(wagmiConfig, { ...chain, address: MANDATE_REGISTRY, abi: mandateRegistryAbi, functionName: "signMandateVersion", args: signMandateArgs(vault, mandate) });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { ...chain, hash: tx });
  if (receipt.status !== "success") throw new Error("signMandateVersion reverted");
  return tx;
}

/** Below a confirmed Mandate: create the Vault if there's none, then sign the Mandate with the wallet. */
export function SignMandate({ mandate }: { mandate: Mandate }) {
  const { owner, vault, refresh } = useOwnVault();
  const [busy, setBusy] = useState<"create" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string; tx: Hash }[]>([]);
  const [historyKey, setHistoryKey] = useState(0);

  async function run(kind: "create" | "sign", fn: () => Promise<{ label: string; tx: Hash }>) {
    setBusy(kind);
    setError(null);
    try {
      const step = await fn();
      setDone((d) => [...d, step]);
      await refresh();
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setError((e as { shortMessage?: string }).shortMessage ?? (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!owner) return <p className="text-violet/70">Connect your wallet to create your Vault and sign this Mandate.</p>;
  return (
    <div className="flex flex-col gap-3">
      {vault === null && (
        <button type="button" className="btn btn-primary self-start" disabled={busy !== null} onClick={() => run("create", async () => ({ label: "Vault created", tx: (await createVault()).tx }))}>
          {busy === "create" ? "Creating your Vault…" : "Create Vault"}
        </button>
      )}
      {vault && (
        <>
          <p>
            Your Vault: <span className="font-mono break-all">{vault}</span>
          </p>
          <button type="button" className="btn btn-primary self-start" disabled={busy !== null} onClick={() => run("sign", async () => ({ label: "Mandate signed", tx: await signMandate(vault, mandate) }))}>
            {busy === "sign" ? "Signing…" : "Sign Mandate"}
          </button>
        </>
      )}
      {done.map((d) => (
        <p key={d.tx}>
          <span className="chip chip-forest">{d.label}</span>{" "}
          <a className="font-mono text-xs underline" href={explorerTx(d.tx)} target="_blank" rel="noreferrer">
            {d.tx.slice(0, 10)}…
          </a>
        </p>
      ))}
      {error && (
        <p role="alert" className="text-orange">
          {error}
        </p>
      )}
      {vault && <MandateHistory key={historyKey} vault={vault} />}
    </div>
  );
}

type History = { versions: ReturnType<typeof versionHistory>; pending: number };

/** Every Mandate Version signed for the Vault, newest first: in force, waiting for the Vault to be Flat, or replaced. */
export function MandateHistory({ vault }: { vault: Address }) {
  const [history, setHistory] = useState<History | null>(null);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    const read = { ...chain, address: MANDATE_REGISTRY, abi: mandateRegistryAbi } as const;
    const [count, effective, pending] = await Promise.all([
      readContract(wagmiConfig, { ...read, functionName: "versionCount", args: [vault] }),
      readContract(wagmiConfig, { ...read, functionName: "effectiveVersion", args: [vault] }),
      readContract(wagmiConfig, { ...read, functionName: "pendingVersion", args: [vault] }),
    ]);
    const versions = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => readContract(wagmiConfig, { ...read, functionName: "versionAt", args: [vault, BigInt(i + 1)] })),
    );
    setHistory({ versions: versionHistory(versions as MandateVersion[], Number(effective), Number(pending)), pending: Number(pending) });
  }, [vault]);

  useEffect(() => {
    const t = setTimeout(() => void load().catch(() => {}), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function activate() {
    setActivating(true);
    try {
      await switchChain(wagmiConfig, chain);
      const tx = await writeContract(wagmiConfig, { ...chain, address: MANDATE_REGISTRY, abi: mandateRegistryAbi, functionName: "activatePending", args: [vault] });
      await waitForTransactionReceipt(wagmiConfig, { ...chain, hash: tx });
      await load();
    } catch {
      // Still not Flat: the version keeps waiting.
    } finally {
      setActivating(false);
    }
  }

  if (!history) return null;
  if (!history.versions.length) return <p className="text-sm text-ink-soft">No Mandate signed for this Vault yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="label-mono">Mandate Versions</p>
      <ul className="flex flex-col gap-2">
        {history.versions.map((v) => (
          <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white p-3 text-sm text-ink">
            <span className="font-mono">v{v.version}</span>
            {v.status === "effective" && <span className="chip chip-forest">In force</span>}
            {v.status === "pending" && <span className="chip chip-amber">Waits until Flat</span>}
            {v.status === "superseded" && <span className="chip">Replaced</span>}
            {v.killFlag && <span className="chip chip-clay">Kill flag</span>}
            <span>
              {formatLeverage(v.leverageCapE2)} leverage · {formatBps(v.stopLossBps)} stop-loss · {formatBps(v.drawdownCapBps)} drawdown · veto above{" "}
              {formatUsdc(v.vetoThresholdUsdc)}
            </span>
            <span className="text-xs text-ink-soft">{new Date(Number(v.signedAt) * 1000).toLocaleString()}</span>
            <span className="w-full truncate font-mono text-xs text-ink-faint" title={v.mandateHash}>
              {v.mandateHash}
            </span>
          </li>
        ))}
      </ul>
      {history.pending > 0 && (
        <button type="button" className="btn btn-secondary self-start" disabled={activating} onClick={() => void activate()}>
          {activating ? "Activating…" : "Activate the waiting version (Vault is Flat)"}
        </button>
      )}
    </div>
  );
}
