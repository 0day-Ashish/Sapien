import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "../ui/art";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";
import { DOC_PAGES, docHref, type DocPage } from "./content";
import { DocsSearch, DocToc, type SearchItem } from "./docs-client";
import { EXT, REPO } from "./resources";

const QUICK: { href: string; label: string; icon: IconName; external?: boolean }[] = [
  { href: "/mandate", label: "Open the app", icon: "vault" },
  { href: "/live", label: "Live trading", icon: "chart" },
  { href: REPO, label: "GitHub", icon: "mandate", external: true },
  { href: "/", label: "Website", icon: "shield" },
];

const GROUPS = [...new Set(DOC_PAGES.map((p) => p.group))];

const SEARCH: SearchItem[] = DOC_PAGES.flatMap((p) => [
  { href: docHref(p.slug), title: p.nav, context: p.group, text: `${p.nav} ${p.title} ${p.description} ${p.group}`.toLowerCase() },
  ...p.sections.map((s) => ({ href: `${docHref(p.slug)}#${s.id}`, title: s.title, context: p.nav, text: `${s.title} ${p.nav}`.toLowerCase() })),
]);

function SideNav({ current }: { current: string }) {
  return (
    <>
      <ul className="flex flex-col gap-1">
        {QUICK.map((q) => (
          <li key={q.label}>
            <Link href={q.href} {...(q.external ? EXT : {})} className="group flex items-center gap-3 rounded-lg py-1.5 text-[15px] text-ink-soft transition-colors hover:text-ink">
              <span className="flex size-8 items-center justify-center rounded-lg border border-line-strong bg-cream-raised text-ink-soft transition-colors group-hover:border-violet group-hover:text-violet">
                <Icon name={q.icon} className="size-4" />
              </span>
              {q.label}
            </Link>
          </li>
        ))}
      </ul>
      {GROUPS.map((group) => (
        <div key={group} className="mt-8">
          <p className="text-[14px] font-medium text-ink">{group}</p>
          <ul className="mt-2.5 flex flex-col gap-0.5">
            {DOC_PAGES.filter((p) => p.group === group).map((p) => {
              const on = p.slug === current;
              return (
                <li key={p.slug}>
                  <Link
                    href={docHref(p.slug)}
                    aria-current={on ? "page" : undefined}
                    className={`-mx-3 block rounded-xl px-3 py-2 text-[15px] transition-colors ${on ? "bg-violet-soft font-medium text-violet" : "text-ink-soft hover:text-ink"}`}
                  >
                    {p.nav}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/** The docs frame: the site nav, a sidebar with search, the article and "On this page". */
export function DocsShell({ page, children }: { page: DocPage; children?: ReactNode }) {
  const index = DOC_PAGES.indexOf(page);
  const prev = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];

  return (
    <>
      <SiteNav />

      <div className="mx-auto grid w-full max-w-[90rem] flex-1 gap-x-12 px-4 md:px-10 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_13rem]">
        <aside className="hidden lg:block">
          <div className="sticky top-[5.5rem] -ml-3 max-h-[calc(100dvh-5.5rem)] overflow-y-auto py-8 pl-3 pr-3 [scrollbar-width:thin]">
            <div className="mb-7">
              <DocsSearch items={SEARCH} />
            </div>
            <SideNav current={page.slug} />
          </div>
        </aside>

        <main className="min-w-0 pb-20 pt-8 lg:pt-10">
          <div className="lg:hidden">
            <DocsSearch items={SEARCH} />
          </div>
          <details className="group mt-4 rounded-xl border border-line-strong lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
              {page.group}: {page.nav}
              <span aria-hidden="true" className="text-ink-faint transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="border-t border-line px-4 py-4">
              <SideNav current={page.slug} />
            </div>
          </details>

          <article id="doc-article" className="mx-auto mt-8 max-w-[52rem] lg:mt-0">
            <p className="text-[15px] font-medium text-violet">{page.group}</p>
            <h1 className="mt-3 text-balance text-[clamp(2rem,3.6vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.025em] text-ink">{page.title}</h1>
            <p className="mt-4 text-pretty text-[1.1875rem] leading-[1.55] text-ink-soft">{page.description}</p>

            <div className="mt-10 flex flex-col gap-14">
              {page.sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-28">
                  <h2 id={`${s.id}-title`} className="text-[1.625rem] font-medium leading-tight tracking-[-0.02em] text-ink">
                    {s.title}
                  </h2>
                  <div className="mt-4 flex flex-col gap-5 text-[16px] leading-[1.7] text-ink-soft [&_a]:text-violet [&_a]:underline [&_a]:decoration-violet/30 [&_a]:underline-offset-[3px] [&_strong]:font-medium [&_strong]:text-ink">
                    {s.body}
                  </div>
                </section>
              ))}
              {children}
            </div>

            <nav aria-label="Previous and next page" className="mt-16 grid gap-4 border-t border-line pt-8 sm:grid-cols-2">
              {prev ? (
                <Link href={docHref(prev.slug)} className="group rounded-2xl border border-line p-5 transition-colors hover:border-violet">
                  <span className="text-[13px] text-ink-faint">← Previous</span>
                  <span className="mt-1 block text-[1.0625rem] font-medium text-ink group-hover:text-violet">{prev.nav}</span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={docHref(next.slug)} className="group rounded-2xl border border-line p-5 text-right transition-colors hover:border-violet">
                  <span className="text-[13px] text-ink-faint">Next →</span>
                  <span className="mt-1 block text-[1.0625rem] font-medium text-ink group-hover:text-violet">{next.nav}</span>
                </Link>
              )}
            </nav>
          </article>
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-[5.5rem] py-10">
            <DocToc items={page.sections.map(({ id, title }) => ({ id, title }))} />
          </div>
        </aside>
      </div>
      <SiteFooter />
    </>
  );
}
