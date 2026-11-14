"use client";

import { NearConnector } from "@hot-labs/near-connect";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NEAR_NETWORK } from "@/lib/near/config";
import type { TxRequest } from "@/lib/near/tx";

// The user's wallet: Meteor on NEAR testnet, through NEAR Connect. Reads (balances, Vault record) need no wallet;
// every write is a transaction the user approves in Meteor.

const METEOR = "meteor-wallet";

type Status = "disconnected" | "connecting" | "connected";

type NearWallet = {
  /** The connected NEAR account, e.g. `alice.testnet`. */
  accountId: string | null;
  status: Status;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Signs and sends one transaction in Meteor; resolves with the final execution outcome. */
  send: (tx: TxRequest) => Promise<unknown>;
};

const Ctx = createContext<NearWallet | null>(null);

const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "Wallet request failed");

export function NearWalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = new NearConnector({ network: NEAR_NETWORK, footerBranding: null });
    connector.current = c;
    const onIn = (e: { accounts: { accountId: string }[] }) => {
      setAccountId(e.accounts[0]?.accountId ?? null);
      setStatus(e.accounts[0] ? "connected" : "disconnected");
    };
    const onOut = () => {
      setAccountId(null);
      setStatus("disconnected");
    };
    c.on("wallet:signIn", onIn);
    c.on("wallet:signOut", onOut);
    // Restore an earlier session.
    void c.whenManifestLoaded
      .then(() => c.getConnectedWallet())
      .then(({ accounts }) => onIn({ accounts }))
      .catch(() => {});
    return () => {
      c.off("wallet:signIn", onIn);
      c.off("wallet:signOut", onOut);
      connector.current = null;
    };
  }, []);

  const connect = useCallback(async () => {
    const c = connector.current;
    if (!c) return;
    setError(null);
    setStatus("connecting");
    try {
      await c.whenManifestLoaded;
      const wallet = await c.connect({ walletId: METEOR });
      const [account] = await wallet.getAccounts({ network: NEAR_NETWORK });
      setAccountId(account?.accountId ?? null);
      setStatus(account ? "connected" : "disconnected");
    } catch (e) {
      setStatus("disconnected");
      setError(errorText(e));
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await connector.current?.disconnect();
    } catch {
      // Already signed out.
    }
    setAccountId(null);
    setStatus("disconnected");
  }, []);

  const send = useCallback(async (tx: TxRequest) => {
    const c = connector.current;
    if (!c) throw new Error("Wallet not ready");
    const wallet = await c.wallet();
    return wallet.signAndSendTransaction(tx);
  }, []);

  const value = useMemo(() => ({ accountId, status, error, connect, disconnect, send }), [accountId, status, error, connect, disconnect, send]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNearWallet(): NearWallet {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNearWallet needs NearWalletProvider");
  return v;
}
