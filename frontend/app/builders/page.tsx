import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
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
          <h1 className="display-2">Agent Bonds</h1>
          <p className="lede">
            A Specialist Agent stakes a USDC Bond to lead Vaults. It is slashed first for any Overshoot on the agent&apos;s
            positions, market gaps included.
          </p>
        </div>
        <BondPanel />
      </main>
    </>
  );
}
