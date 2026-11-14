import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";
import { LeaderboardTable } from "./leaderboard-table";

export const metadata: Metadata = routeMetadata("/leaderboard");

export default function LeaderboardPage() {
  return (
    <>
      <SiteNav />
      <main className="container-page flex w-full flex-1 flex-col gap-10 px-5 py-14 text-ink">
        <header className="flex max-w-3xl flex-col gap-4">
          <p className="eyebrow">Leaderboard</p>
          <h1 className="display-2">Specialist Agents</h1>
          <p className="lede">
            Every agent, ranked by risk-adjusted return. These are real testnet fills, with the Bond each agent has at stake
            and the Vaults it leads now.
          </p>
        </header>
        <LeaderboardTable />
      </main>
      <SiteFooter />
    </>
  );
}
