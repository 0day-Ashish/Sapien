import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/lib/brand";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";
import { LegalToc } from "./legal-toc";

export const LEGAL_UPDATED = "14 November 2026";
export const CONTACT_URL = "https://github.com/0day-Ashish/hackmatrix-26/issues";

export const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/risk", label: "Risk disclosure" },
];

export type LegalSection = { id: string; title: string; body: ReactNode };

const num = (i: number) => String(i + 1).padStart(2, "0");
/** Body copy, shared by paragraphs and lists. */
const BODY = "text-[15px] leading-[26px] text-ink/80 md:text-[16px] md:leading-[28px]";

/**
 * Shared layout for the legal pages. Left rail: the legal pages, then "On this page" (sticky). Centre: a 680px article
 * with numbered sections between hairlines and a contact card. A third, empty column on very wide screens keeps the
 * article centred. On small screens the pages become pills and the contents a collapsible list.
 */
export function LegalPage(props: { eyebrow: string; title: string; intro: ReactNode; sections: LegalSection[]; current: string }) {
  const { eyebrow, title, intro, sections, current } = props;
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[90rem] px-4 pb-20 pt-12 md:pb-28 md:pt-16 min-[921px]:px-10">
          <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,680px)] lg:justify-center lg:gap-16 xl:grid-cols-[240px_minmax(0,680px)_240px] xl:gap-20">
            <aside className="min-w-0 lg:sticky lg:top-28 lg:row-span-2 lg:self-start">
              <nav aria-label="Legal">
                <p className="label-mono hidden text-xs text-ink-faint lg:block">Legal</p>
                <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:mt-4 lg:flex-col lg:gap-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
                  {LEGAL_PAGES.map((p) => {
                    const on = p.href === current;
                    return (
                      <li key={p.href} className="shrink-0">
                        <Link
                          href={p.href}
                          aria-current={on ? "page" : undefined}
                          className={`flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[14px] transition-colors duration-150 lg:h-auto lg:rounded-none lg:border-0 lg:border-b lg:border-line lg:px-0 lg:py-2.5 ${
                            on ? "border-ink text-ink" : "border-line text-ink-soft hover:text-ink"
                          }`}
                        >
                          {on && <span aria-hidden="true" className="mr-2 hidden size-1.5 rounded-full bg-violet lg:inline-block" />}
                          {p.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="mt-12 hidden lg:block">
                <LegalToc items={sections.map(({ id, title }) => ({ id, title }))} />
              </div>
            </aside>

            <article className="min-w-0">
              <header className="flex flex-col items-start gap-5">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-2 w-3.5 rounded-[2px] bg-violet" />
                  <span className="label-mono text-xs text-ink md:text-[13px]">{eyebrow}</span>
                </span>
                <h1 className="text-balance text-[40px] font-medium leading-[1.05] tracking-tight text-ink md:text-[56px]">{title}</h1>
                <p className="font-mono text-[13px] text-ink-soft">Last updated {LEGAL_UPDATED}</p>
              </header>
              <div className="mt-8 text-pretty text-[16px] leading-[28px] text-ink-soft md:text-[17px] md:leading-[30px]">{intro}</div>

              <details className="group mt-10 rounded-lg border border-line lg:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  On this page
                  <span aria-hidden="true" className="font-mono text-[13px] text-ink-faint group-open:hidden">
                    +
                  </span>
                  <span aria-hidden="true" className="hidden font-mono text-[13px] text-ink-faint group-open:inline">
                    −
                  </span>
                </summary>
                <ol className="border-t border-line px-4 py-2">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="flex gap-3 py-2 text-[14px] leading-[22px] text-ink-soft transition-colors hover:text-ink">
                        <span className="w-5 shrink-0 font-mono text-[12px] leading-[22px] text-ink-faint">{num(i)}</span>
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>

              <div className="mt-10 border-t border-line">
                {sections.map((s, i) => (
                  <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-28 border-b border-line py-8 md:py-10">
                    <h2 id={`${s.id}-title`} className="flex gap-3 text-[18px] font-medium leading-7 text-ink md:text-[21px]">
                      <span className="font-mono text-[12px] font-normal leading-7 text-ink-faint md:text-[13px]">{num(i)}</span>
                      {s.title}
                    </h2>
                    <div className={`mt-4 flex flex-col gap-4 text-pretty ${BODY} [&_a]:text-violet [&_a]:underline [&_a]:decoration-violet/30 [&_a]:underline-offset-[3px] [&_strong]:font-medium [&_strong]:text-ink`}>
                      {s.body}
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-10 rounded-lg border border-line p-6 md:p-8">
                <p className="label-mono text-xs text-ink-faint">Contact</p>
                <p className="mt-3 text-[16px] font-medium text-ink">{PRODUCT_NAME}</p>
                <p className={`mt-1 ${BODY} text-ink-soft`}>
                  Open-source project on testnet.
                  <br />
                  Questions about this page:{" "}
                  <a
                    href={CONTACT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet underline decoration-violet/30 underline-offset-[3px] hover:decoration-violet"
                  >
                    open an issue on GitHub
                  </a>
                </p>
              </div>
            </article>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** A bulleted list styled for legal copy. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className={`flex list-disc flex-col gap-2 pl-5 marker:text-ink-faint ${BODY}`}>
      {items.map((item, i) => (
        <li key={i} className="text-pretty pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}
