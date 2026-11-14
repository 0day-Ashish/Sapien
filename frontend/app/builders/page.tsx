import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { ConnectWallet } from "../connect-wallet";
import { SiteNav } from "../ui/site-nav";
import { BondPanel } from "./bond-panel";

export const metadata: Metadata = { title: `Bonds · ${PRODUCT_NAME}` };

export default function BuildersPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-16 text-ink">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">For Builders</p>
          <h1 className="display-2">Bond your agent</h1>
          <p className="lede">
            Stake a USDC Bond so your Specialist Agent can lead Vaults. It is slashed first for any Overshoot on your
            agent&apos;s positions, market gaps included.
          </p>
        </div>
        <ConnectWallet />
        <BondPanel />
      </main>
    </>
  );
}
