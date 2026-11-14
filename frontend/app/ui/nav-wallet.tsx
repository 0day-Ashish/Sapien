"use client";

import { useConnect, useConnection, useDisconnect } from "wagmi";

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v3" />
      <path d="M3 6v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M21 12v4h-4a2 2 0 0 1 0-4z" />
    </svg>
  );
}

/** The nav's wallet control: an icon that connects, and once connected shows the short address and disconnects. */
export function NavWallet() {
  const { address, status } = useConnection();
  const { mutate: connect, connectors, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();

  const connected = status === "connected" && address;
  const label = connected ? `Disconnect ${address}` : "Connect wallet";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={isPending}
      onClick={() => (connected ? disconnect() : connectors[0] && connect({ connector: connectors[0] }))}
      className="flex h-11 items-center gap-2 rounded-full px-3 text-violet transition-colors hover:bg-violet-tint hover:text-violet-ink disabled:opacity-50"
    >
      <span className="relative">
        <WalletIcon className="size-6" />
        {connected && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-green" />}
      </span>
      {connected && <span className="hidden font-mono text-xs md:inline">{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>}
    </button>
  );
}
