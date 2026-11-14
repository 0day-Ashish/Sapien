import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/site";
import { SiteNav } from "../../ui/site-nav";
import { CoverageRatio } from "../coverage";
import { PayoutDetail } from "./payout-detail";

const DESCRIPTION = "One Overshoot settlement: the stop-loss, its fill, who paid, and the evidence with its onchain hash check.";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    ...pageMetadata({ title: `Overshoot payout ${id.slice(0, 10)}…`, description: DESCRIPTION, path: `/payouts/${id}`, json: `/api/v1/payouts/${id}` }),
    // Each payout is evidence, not a landing page: the list at /payouts is what search should show.
    robots: { index: false, follow: true },
  };
}

// The claim id is runtime data (no generateStaticParams), so it's read inside a Suspense boundary and the rest of the
// page stays in the static shell (cacheComponents).
async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayoutDetail id={id} />;
}

export default function PayoutPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-16 text-ink">
        <div className="flex flex-col gap-4">
          <Link href="/payouts" className="label-mono text-violet">
            ← All payouts
          </Link>
          <h1 className="display-2">Overshoot payout</h1>
        </div>
        <Suspense fallback={<p className="text-ink-soft">Loading payout…</p>}>
          <Detail params={params} />
        </Suspense>
        <CoverageRatio />
      </main>
    </>
  );
}
