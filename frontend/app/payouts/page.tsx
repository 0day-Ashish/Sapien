import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { SiteNav } from "../ui/site-nav";
import { CoverageRatio } from "./coverage";
import { PayoutsList } from "./payouts-list";

export const metadata: Metadata = routeMetadata("/payouts");

export default function PayoutsPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-16 text-ink">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Stop-loss protected</p>
          <h1 className="display-2">Overshoot payouts</h1>
          <p className="lede">
            When a stop-loss fills past its trigger, the Lead Agent&apos;s Bond pays first, then the Protection Fund, up to
            10% of the Vault&apos;s value per Epoch. The Protocol Reserve pays when our infrastructure failed.
          </p>
        </div>
        <CoverageRatio />
        <PayoutsList />
      </main>
    </>
  );
}
