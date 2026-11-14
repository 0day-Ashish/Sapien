import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";
import { ReleaseNav } from "./release-nav";
import { RELEASES, type Item, type Release } from "./releases";

export const metadata: Metadata = routeMetadata("/changelog");

const counts = (r: Release) =>
  [
    { n: r.added.length, label: "new" },
    { n: r.improved.length, label: "improved" },
    { n: r.fixed.length, label: "fixed" },
  ].filter((c) => c.n > 0);

const TINT = "bg-violet-soft text-violet-deep";
const OUTLINE = "border border-line-strong text-ink-soft";

// The four newest releases cycle through a stacked deck; each card starts a quarter of the way through the loop.
const DECK = [
  { transform: "translateY(0) scale(1)", opacity: 1, zIndex: 4, delay: "0s" },
  { transform: "translateY(-16px) scale(0.96)", opacity: 0.75, zIndex: 3, delay: "-10.5s" },
  { transform: "translateY(-32px) scale(0.92)", opacity: 0.45, zIndex: 2, delay: "-7s" },
  { transform: "translateY(-48px) scale(0.88)", opacity: 0.2, zIndex: 1, delay: "-3.5s" },
];

function Group({ label, tint, items }: { label: string; tint: boolean; items: Item[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-4 border-b border-line p-5 last:border-b-0 md:p-8">
      <span className={`inline-flex h-7 w-fit items-center rounded-full px-3 text-[12px] font-medium ${tint ? TINT : OUTLINE}`}>{label}</span>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.title ?? item.body} className="flex gap-3 text-pretty text-[15px] leading-relaxed text-ink-soft">
            <span aria-hidden="true" className="mt-[0.7em] size-1 shrink-0 rounded-full bg-ink-faint" />
            <span>
              {item.title && <span className="font-medium text-ink">{item.title}</span>}
              {item.title ? `: ${item.body}` : item.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChangelogPage() {
  const versions = RELEASES.map((r) => r.version);
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[90rem] px-4 pb-20 pt-12 md:pb-28 md:pt-16 min-[921px]:px-10">
          <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,680px)] lg:justify-center lg:gap-16 xl:grid-cols-[240px_minmax(0,680px)_240px] xl:gap-20">
            <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
              <div className="hidden lg:block">
                <ReleaseNav versions={versions} />
              </div>
              <nav aria-label="Releases" className="lg:hidden">
                <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {versions.map((v) => (
                    <li key={v} className="shrink-0">
                      <a href={`#${v}`} className="flex h-11 items-center whitespace-nowrap rounded-full border border-line-strong px-4 font-mono text-[13px] text-ink-soft transition-colors duration-150 hover:text-ink">
                        {v}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <div className="min-w-0">
              <header className="flex flex-col items-start gap-5">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-2 w-3.5 rounded-[2px] bg-violet" />
                  <span className="label-mono text-xs text-ink md:text-[13px]">Changelog</span>
                </span>
                <h1 className="text-balance text-[40px] font-normal leading-[1.1] tracking-[-0.025em] text-ink md:text-[56px]">What&apos;s new in {PRODUCT_NAME}.</h1>
                <p className="max-w-[560px] text-pretty text-[15px] leading-relaxed text-ink-soft md:text-[17px]">
                  See what is new in {PRODUCT_NAME}. Browse releases by version for new features, improvements and fixes across the app,
                  the engine and the contracts.
                </p>

                <div aria-hidden="true" className="relative w-[320px] max-w-full pt-14 md:w-[420px]">
                  <div className="relative h-[196px]">
                    {RELEASES.slice(0, 4).map((r, i) => {
                      const d = DECK[i]!;
                      return (
                        <div
                          key={r.version}
                          style={{ transform: d.transform, opacity: d.opacity, zIndex: d.zIndex, animation: `release-cycle 14s ease-in-out ${d.delay} infinite` }}
                          className="absolute inset-x-0 top-0 origin-top rounded-xl border border-line bg-cream-raised p-5 shadow-[0_18px_40px_-20px_rgb(58_42_134/0.45)] motion-reduce:![animation:none] md:p-6"
                        >
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="font-mono text-[22px] text-ink md:text-[24px]">{r.version}</span>
                            <span className="font-mono text-[12px] text-ink-faint">{r.date.split(" · ")[1]}</span>
                          </div>
                          <p className="mt-3 line-clamp-2 text-[14px] leading-relaxed text-ink-soft">{r.summary}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {counts(r).map((c, k) => (
                              <span key={c.label} className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${k === 0 ? TINT : OUTLINE}`}>
                                {c.n} {c.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="font-mono text-[12px] text-ink-faint md:text-[13px]">{RELEASES.length} releases on 14 November 2026</p>
              </header>

              <div className="mt-12 md:mt-16">
                {RELEASES.map((r, i) => (
                  <article key={r.version} id={r.version} className="scroll-mt-24 border-t border-line py-12 md:py-16">
                    <header className="flex flex-col items-start gap-3">
                      <p className="flex flex-wrap items-center gap-2.5 font-mono text-[13px] text-ink-faint">
                        <time>{r.date}</time>
                        {i === 0 && <span className={`inline-flex h-6 items-center rounded-full px-2.5 font-sans text-[11px] font-medium ${TINT}`}>Latest</span>}
                      </p>
                      <h2 className="font-mono text-[32px] leading-none text-ink md:text-[40px]">{r.version}</h2>
                      <p className="mt-1 text-pretty text-[17px] leading-relaxed text-ink md:text-[19px]">{r.summary}</p>
                      <p className="font-mono text-[12px] text-ink-faint">
                        {counts(r)
                          .map((c) => `${c.n} ${c.label}`)
                          .join(" · ")}
                      </p>
                    </header>
                    <div className="mt-8 overflow-hidden rounded-lg border border-line bg-cream-raised">
                      <Group label="New" tint items={r.added} />
                      <Group label="Improved" tint={false} items={r.improved} />
                      <Group label="Fixed" tint={false} items={r.fixed} />
                    </div>
                    <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
                      <span className="label-mono text-[11px] text-ink-faint">Learn more</span>
                      {r.learnMore.map((l) => (
                        <Link key={l.href + l.label} href={l.href} className="inline-flex items-center gap-0.5 text-violet underline decoration-violet/30 underline-offset-[3px] hover:decoration-violet">
                          {l.label}
                          <span aria-hidden="true" className="text-[12px]">↗</span>
                        </Link>
                      ))}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
