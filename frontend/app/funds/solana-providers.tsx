"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";
import { SOLANA } from "@/lib/cctp/solana";

/** Solana devnet connection and wallets (Phantom, Solflare and others register themselves via Wallet Standard). */
export function SolanaProviders({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={SOLANA.rpc}>
      <WalletProvider wallets={[]} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
