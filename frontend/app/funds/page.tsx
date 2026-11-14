import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { ConnectWallet } from "../connect-wallet";
import { SiteNav } from "../ui/site-nav";
import { FundsPanel } from "./funds-panel";

export const metadata: Metadata = { title: `Deposit and withdraw · ${PRODUCT_NAME}` };

export default function FundsPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-16 text-ink">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Vault funds</p>
          <h1 className="display-2">Deposit and withdraw</h1>
          <p className="lede">
            Deposit USDC from Base Sepolia into your Vault, and withdraw it back once the Vault is Flat. Every step is
            shown until the money arrives.
          </p>
        </div>
        <ConnectWallet />
        <FundsPanel />
      </main>
    </>
  );
}
