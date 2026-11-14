import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";

export const LEGAL_UPDATED = "November 14, 2026";
export const CONTACT_URL = "https://github.com/0day-Ashish/hackmatrix-26/issues";

export const LEGAL_PAGES = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/risk", label: "Risk Disclosure" },
];

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Shared layout for the legal pages: header, table of contents, numbered sections. */
export function LegalPage(props: { eyebrow: string; title: string; intro: ReactNode; sections: LegalSection[]; current: string }) {
  const { eyebrow, title, intro, sections, current } = props;
  return (
    <>
      <SiteNav />
      <main className="container-narrow flex w-full flex-1 flex-col gap-12 px-5 py-16 text-ink">
        <header className="flex max-w-3xl flex-col gap-4">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display-2">{title}</h1>
          <div className="lede">{intro}</div>
          <p className="label-mono text-ink-faint">Last updated {LEGAL_UPDATED}</p>
        </header>

        <div className="grid gap-12 lg:grid-cols-[15rem_1fr]">
          <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
            <div className="card flex flex-col gap-4 p-5">
              <p className="label-mono text-violet">On this page</p>
              <ol className="flex flex-col gap-2 text-sm">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-ink-soft transition-colors hover:text-violet">
                      <span className="font-mono text-xs text-ink-faint">{String(i + 1).padStart(2, "0")}</span> {s.title}
                    </a>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
                {LEGAL_PAGES.filter((p) => p.href !== current).map((p) => (
                  <Link key={p.href} href={p.href} className="text-violet hover:text-violet-ink">
                    {p.label} →
                  </Link>
                ))}
              </div>
            </div>
          </nav>

          <div className="flex max-w-3xl flex-col gap-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28">
                <h2 className="title-serif mb-3 text-violet-ink">
                  <span className="mr-2 font-mono text-sm text-violet/60">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="flex flex-col gap-3 text-[0.9875rem] leading-relaxed text-ink-soft">{s.body}</div>
              </section>
            ))}
            <p className="rounded-xl bg-violet-tint p-5 text-sm text-violet-ink">
              Questions about this page? Open an issue on{" "}
              <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="underline">
                GitHub
              </a>
              .
            </p>
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
    <ul className="ml-5 list-disc space-y-1.5 marker:text-violet">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
