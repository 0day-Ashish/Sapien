"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { createNearVault, fetchNearVault, type NearVault } from "@/lib/near/engine";
import { vaultOf, type VaultRecord } from "@/lib/near/view";
import { useNearWallet } from "./near-wallet";

type Tagged<T> = { account: string; value: T };

/**
 * The connected NEAR account's Vault: the engine's binding (`evmVault`, the HyperEVM Vault that trades) and the NEAR
 * contract's record (Mandate hash, Kill Switch, deposited, withdrawn). `vault` is undefined while loading, null if none.
 */
export function useNearVault() {
  const { accountId } = useNearWallet();
  const [bound, setBound] = useState<Tagged<NearVault | null> | null>(null);
  const [recordState, setRecordState] = useState<Tagged<VaultRecord | null> | null>(null);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    const [v, r] = await Promise.all([
      fetchNearVault(accountId).catch(() => null),
      vaultOf(accountId).catch(() => null),
    ]);
    setBound({ account: accountId, value: v });
    setRecordState({ account: accountId, value: r });
  }, [accountId]);

  useEffect(() => {
    // Poll the record: the engine's calls (a paid withdrawal, a bound Vault) land a few seconds after the user's.
    const first = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  /** Creates the Vault through the engine (idempotent), then reloads. */
  const create = useCallback(async () => {
    if (!accountId) throw new Error("Connect your wallet first");
    await createNearVault(accountId);
    // The engine registers the Vault on NEAR before it answers; give the RPC a moment to show it.
    await refresh();
  }, [accountId, refresh]);

  const vault = accountId && bound?.account === accountId ? bound.value : undefined;
  const record = accountId && recordState?.account === accountId ? recordState.value : undefined;
  return {
    account: accountId,
    /** The HyperEVM Vault, as an address. */
    evmVault: (vault?.evmVault ?? null) as Address | null,
    vault,
    record,
    refresh,
    create,
  };
}
