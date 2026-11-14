import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { EXT, REPO } from "../docs/resources";
import { Icon } from "../ui/art";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";

export const metadata: Metadata = { title: `Contact · ${PRODUCT_NAME}` };

const TEAM = [
  { handle: "0day-Ashish", name: "Ashish", photo: "/ashish.jpg", area: "Product and frontend", owns: "Every screen, the Mandate chat, Builder and user features.", tone: "bg-violet-soft", ink: "text-violet", badge: "bg-violet" },
  { handle: "arya232006", name: "Aryadeep", photo: "/aryadeep.jpg", area: "Engine and agents", owns: "The Execution Engine, the agents, the Allocator and the testnet run.", tone: "bg-blue-soft", ink: "text-blue", badge: "bg-blue" },
  { handle: "SachPlayZ", name: "Sachindra", photo: "/sachindra.jpg", area: "Chain and money", owns: "The contracts, deposits and withdrawals, and settlement.", tone: "bg-green-soft", ink: "text-green", badge: "bg-green" },
];

const INCLUDE = [
  "The page you were on and what you did",
  "What you expected, and what happened instead",
  "Your Vault address or a transaction link, if one is involved",
];

export default function ContactPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[90rem] px-3 pb-20 pt-12 md:px-5 md:pb-28 md:pt-16">
          <header className="flex flex-col items-center gap-6 px-4 text-center">
            <span className="eyebrow">Contact</span>
            <h1 className="display-1">Get in touch</h1>
            <p className="lede max-w-2xl">
              {PRODUCT_NAME} is open source, so we answer in the open. There is no contact form and no support inbox yet: a GitHub
              issue is the fastest way to reach us.
            </p>
          </header>

          {/* One large panel for the main route (an issue), two smaller ones beside it */}
          <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <section aria-labelledby="issue-title" className="relative flex flex-col overflow-hidden rounded-[2rem] bg-violet-ink p-7 text-white md:p-12">
              <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full border border-white/10" />
              <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-4 size-48 rounded-full border border-white/10" />
              <p className="label-mono text-xs text-violet-line">Questions, bugs and ideas</p>
              <h2 id="issue-title" className="mt-4 max-w-md font-serif text-[clamp(2rem,3.4vw,3rem)] leading-[1.08] tracking-[-0.02em]">
                Open an issue, and the right person picks it up.
              </h2>
              <ul className="mt-8 flex flex-col gap-3">
                {INCLUDE.map((line, i) => (
                  <li key={line} className="flex items-start gap-3 text-[16px] leading-snug text-white/85">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[11px] text-violet-line">{i + 1}</span>
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-2 pl-9 text-[14px] text-white/55">For a bug, these three things let us reproduce it.</p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <a href={`${REPO}/issues/new`} {...EXT} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-violet-ink transition-transform duration-200 hover:scale-[1.03]">
                  Open an issue <span aria-hidden="true">↗</span>
                </a>
                <a href={`${REPO}/issues`} {...EXT} className="text-[15px] text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white">
                  See open issues
                </a>
              </div>
            </section>

            <div className="grid gap-4">
              <section aria-labelledby="builders-title" className="flex flex-col rounded-[2rem] bg-teal-soft p-7 text-[#0a4a47] md:p-9">
                <Icon name="bond" className="size-9 text-teal" />
                <h2 id="builders-title" className="display-3 mt-6 !text-[1.75rem]">
                  Bring an agent
                </h2>
                <p className="mt-2 text-[16px] leading-snug opacity-85">
                  Want your Specialist Agent to compete? Register it and post its Bond. For anything else, open an issue and say what
                  your agent trades.
                </p>
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12px] uppercase tracking-wider text-teal">
                  <Link href="/builders" className="hover:underline">
                    Bring an agent →
                  </Link>
                  <Link href="/docs#builders" className="hover:underline">
                    Bond rules →
                  </Link>
                </div>
              </section>

              <section aria-labelledby="safety-title" className="flex gap-5 rounded-[2rem] bg-orange-soft p-7 text-[#6e2e0d] md:p-9">
                <Icon name="shield" className="size-9 shrink-0 text-orange" />
                <div>
                  <h2 id="safety-title" className="text-[1.1875rem] font-medium leading-snug">
                    Issues are public
                  </h2>
                  <p className="mt-1.5 text-[16px] leading-snug opacity-85">
                    Never post a private key or seed phrase. Nobody from {PRODUCT_NAME} will ever ask for one.
                  </p>
                </div>
              </section>
            </div>
          </div>

          {/* The team, as three name badges */}
          <section aria-labelledby="team-title" className="mt-20">
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 id="team-title" className="display-serif">
                Three people build {PRODUCT_NAME}
              </h2>
              <p className="max-w-lg text-[1.0625rem] text-violet">Each owns one part of it, so you can tell who will read your issue.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {TEAM.map((m, i) => (
                <a
                  key={m.handle}
                  href={`https://github.com/${m.handle}`}
                  {...EXT}
                  className={`group relative flex flex-col rounded-[1.5rem] p-7 pt-10 transition-transform duration-300 hover:-translate-y-1 hover:rotate-0 ${m.tone} ${["-rotate-1", "rotate-[0.6deg]", "-rotate-[0.4deg]"][i]}`}
                >
                  {/* Badge slot */}
                  <span aria-hidden="true" className="absolute left-1/2 top-4 h-2 w-12 -translate-x-1/2 rounded-full bg-cream" />
                  <Image
                    src={m.photo}
                    alt={`Photo of ${m.name}`}
                    width={192}
                    height={192}
                    className={`size-24 rounded-full object-cover p-1 ${m.badge}`}
                  />
                  <p className={`label-mono mt-6 text-xs ${m.ink}`}>{m.area}</p>
                  <p className="mt-2 text-[1.375rem] font-medium text-ink">{m.name}</p>
                  <p className={`flex items-center gap-1.5 text-[15px] ${m.ink}`}>
                    @{m.handle}
                    <span aria-hidden="true" className={`transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${m.ink}`}>
                      ↗
                    </span>
                  </p>
                  <p className="mt-2 text-[15px] leading-snug text-ink-soft">{m.owns}</p>
                </a>
              ))}
            </div>
          </section>

          {/* Self-serve links, as one ruled list */}
          <section aria-labelledby="first-title" className="mx-auto mt-20 max-w-3xl">
            <h2 id="first-title" className="label-mono text-xs text-ink-faint">
              It might already be answered
            </h2>
            <ul className="mt-4 border-t border-line-strong">
              {[
                { href: "/docs", title: "Docs", body: "How Vaults, Mandates, agents and stop-loss protection work." },
                { href: "/risk", title: "Risk Disclosure", body: "What can go wrong, and what protection does not cover." },
                { href: "/changelog", title: "Changelog", body: "What has shipped so far." },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="group flex items-baseline gap-4 border-b border-line-strong py-5 text-violet-ink">
                    <span className="w-44 shrink-0 font-serif text-[1.5rem] leading-none transition-colors group-hover:text-violet">{l.title}</span>
                    <span className="hidden flex-1 text-[15px] text-ink-soft sm:block">{l.body}</span>
                    <span aria-hidden="true" className="ml-auto text-violet transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
