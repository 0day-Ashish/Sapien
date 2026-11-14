import Link from "next/link";
import { ConnectWallet } from "./connect-wallet";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-24">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Agentic Perps Vault
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Bonded AI agents trade your Hyperliquid Vault under a Mandate you
          sign. Stop-loss protected.
        </p>
      </div>
      <ConnectWallet />
      <Link href="/mandate" className="self-start text-sm font-medium underline">
        Write your Mandate
      </Link>
    </main>
  );
}
