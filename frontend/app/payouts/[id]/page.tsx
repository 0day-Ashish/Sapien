import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { SiteNav } from "../../ui/site-nav";
import { CoverageRatio } from "../coverage";
import { PayoutDetail } from "./payout-detail";

export const metadata: Metadata = { title: `Overshoot payout · ${PRODUCT_NAME}` };

export default async function PayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
        <PayoutDetail id={id} />
        <CoverageRatio />
      </main>
    </>
  );
}
