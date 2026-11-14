"use client";

import { nearAccountUrl } from "@/lib/near/config";
import { useNearWallet } from "./near-wallet";

/** Connects Meteor Wallet on NEAR testnet; once connected, shows the account id. */
export function ConnectWallet() {
  const { accountId, status, error, connect, disconnect } = useNearWallet();

  if (accountId) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="chip chip-forest">NEAR testnet</span>
        <a className="font-mono text-sm text-violet underline" href={nearAccountUrl(accountId)} target="_blank" rel="noreferrer">
          {accountId}
        </a>
        <button type="button" className="btn btn-secondary" onClick={() => void disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className="btn btn-primary" disabled={status === "connecting"} onClick={() => void connect()}>
        {status === "connecting" ? "Connecting…" : "Connect Meteor Wallet"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-orange">
          {error}
        </p>
      )}
    </div>
  );
}
