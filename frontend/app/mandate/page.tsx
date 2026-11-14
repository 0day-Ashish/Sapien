import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { ConnectWallet } from "../connect-wallet";
import { SiteNav } from "../ui/site-nav";
import { MandateComposer } from "./mandate-composer";

export const metadata: Metadata = { title: `Write your Mandate · ${PRODUCT_NAME}` };

export default function MandatePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-16">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Mandate</p>
          <h1 className="display-2">Write your Mandate</h1>
          <p className="lede">
            Describe your risk rules in plain English. You confirm or edit every field before you sign, and agents
            trade only inside what you sign.
          </p>
        </div>
        <ConnectWallet />
        <MandateComposer />
      </main>
    </>
  );
}
