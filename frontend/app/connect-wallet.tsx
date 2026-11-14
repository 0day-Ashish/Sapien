"use client";

import { useConnect, useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { hyperEvmTestnet } from "@/lib/wagmi";

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, chainId, status } = useConnection();
  const { mutate: connect, connectors, isPending, error } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending: isSwitching } = useSwitchChain();

  const button =
    "h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50";

  if (status === "connected" && address) {
    const wrongChain = chainId !== hyperEvmTestnet.id;
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-mono text-sm">
          {shorten(address)} ·{" "}
          {wrongChain ? `chain ${chainId}` : hyperEvmTestnet.name}
        </p>
        <div className="flex gap-3">
          {wrongChain && (
            <button
              className={button}
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: hyperEvmTestnet.id })}
            >
              Switch to {hyperEvmTestnet.name}
            </button>
          )}
          <button
            className="h-11 rounded-full border border-current px-5 text-sm font-medium"
            onClick={() => disconnect()}
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  const connector = connectors[0];
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className={button}
        disabled={!connector || isPending || status === "reconnecting"}
        onClick={() =>
          connector && connect({ connector, chainId: hyperEvmTestnet.id })
        }
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {error && <p className="text-sm text-red-600">{error.message}</p>}
    </div>
  );
}
