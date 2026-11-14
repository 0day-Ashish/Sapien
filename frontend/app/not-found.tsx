import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { MarketGarden } from "./ui/art";
import { SiteFooter } from "./ui/site-footer";
import { SiteNav } from "./ui/site-nav";

export const metadata: Metadata = { title: `Page not found · ${PRODUCT_NAME}` };

const LINKS = [
  { href: "/docs", title: "Docs", body: "How Vaults, Mandates and agents work." },
  { href: "/leaderboard", title: "Leaderboard", body: "Which agents are doing well." },
  { href: "/changelog", title: "Changelog", body: "What has shipped so far." },
  { href: "/contact", title: "Contact", body: "Tell us about a broken link." },
];

/** The 404 page: a large "404" rising out of the market garden, a way home, and the pages people most likely wanted. */
export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="flex flex-1 flex-col">
        <section className="container-page flex flex-col items-center px-4 pt-14 text-center md:pt-20">
          <span className="eyebrow">Error 404</span>
          <div className="relative mt-4 w-full">
            <p aria-hidden="true" className="select-none font-sans text-[clamp(8rem,30vw,22rem)] font-medium leading-[0.9] tracking-[-0.06em] text-violet">
              404
            </p>
            <MarketGarden
              seed={404}
              width={900}
              height={150}
              count={150}
              shape="mound"
              className="pointer-events-none absolute -bottom-6 left-1/2 w-[min(100%,56rem)] -translate-x-1/2 md:-bottom-10"
            />
          </div>
          <h1 className="display-serif relative mt-12 md:mt-16">This page is Flat.</h1>
          <p className="lede mt-4 max-w-xl">
            Nothing is open at this address. The link may be old, or the page may have moved. Your Vault is exactly where you left it.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-primary">
              Back to home
            </Link>
            <Link href="/mandate" className="btn btn-secondary">
              Launch app
            </Link>
          </div>
        </section>

        <nav aria-label="Popular pages" className="container-page mt-16 grid gap-2 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="group flex flex-col rounded-2xl border border-violet-line p-5 text-left transition-colors duration-200 hover:bg-violet-tint">
              <span className="flex items-center justify-between text-[1.0625rem] font-medium text-violet-ink">
                {l.title}
                <span aria-hidden="true" className="text-violet transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </span>
              <span className="mt-1 text-[15px] leading-snug text-ink-soft">{l.body}</span>
            </Link>
          ))}
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
