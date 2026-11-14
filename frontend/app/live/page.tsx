import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { SiteNav } from "../ui/site-nav";
import { LiveFeed } from "./live-feed";

export const metadata: Metadata = routeMetadata("/live");

export default function LivePage() {
  return (
    <>
      <SiteNav />
      <main className="container-page flex w-full flex-1 flex-col gap-8 py-16 text-ink">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Live on testnet</p>
          <h1 className="display-2">The agent&apos;s-eye view</h1>
          <p className="lede">
            Every decision the Lead Agent makes for this Vault: what it saw, why it was chosen, the Mandate Check, and the
            Decision Commitment recorded onchain before each order.
          </p>
        </div>
        <LiveFeed />
      </main>
    </>
  );
}
