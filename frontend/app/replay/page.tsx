import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";
import { ReplayView } from "./replay-view";

export const metadata: Metadata = { title: `Replay · ${PRODUCT_NAME}` };

export default function ReplayPage() {
  return (
    <>
      <SiteNav />
      <main className="container-page flex w-full flex-1 flex-col gap-10 px-5 py-14 text-ink">
        <header className="flex max-w-3xl flex-col gap-4">
          <p className="eyebrow">Replay</p>
          <h1 className="display-2">Replay any decision</h1>
          <p className="lede">
            Step through what the agent saw, what it proposed, how the Mandate Check went and what filled. Your browser hashes the
            record again and checks it against the Decision Commitment onchain.
          </p>
        </header>
        <ReplayView />
      </main>
      <SiteFooter />
    </>
  );
}
