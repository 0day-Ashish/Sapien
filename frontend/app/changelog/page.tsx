import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { SiteFooter } from "../ui/site-footer";
import { SiteNav } from "../ui/site-nav";
import { ReleaseNav } from "./release-nav";

export const metadata: Metadata = { title: `Changelog · ${PRODUCT_NAME}` };

type Item = { title?: string; body: string };
type Release = {
  version: string;
  date: string;
  summary: string;
  added: Item[];
  improved: Item[];
  fixed: Item[];
  learnMore: { href: string; label: string }[];
};

// Newest first. Each release groups the pull requests that merged in one stretch of 14 November 2026 (times in UTC).
const RELEASES: Release[] = [
  {
    version: "v0.7.0",
    date: "14 November 2026",
    summary: "Money and controls move to NEAR: connect Meteor Wallet, deposit and withdraw test USDC through the Sapien NEAR contract, and set your Kill Switch there.",
    added: [
      { title: "Meteor Wallet on NEAR testnet", body: "the wallet button connects Meteor and shows your NEAR account. Base Sepolia, Solana and CCTP are gone." },
      { title: "Sapien NEAR contract", body: "your Vault is bound to your NEAR account. Deposit test USDC, request a withdrawal and follow it until the engine pays it, with a link to every transaction." },
      { title: "Test USDC faucet", body: "get 1,000 test USDC on NEAR with one click." },
      { title: "NEAR Intents quote", body: "a live mainnet-route quote (NEAR to HyperCore) beside the deposit, so you can see what the same USDC would cost. Display only." },
      { title: "On NEAR panel", body: "the Risk Disclosure lists what lives on NEAR: the engine's limited key, your Mandate hash, the Kill Switch and the agents' payout accounts." },
    ],
    improved: [
      { title: "Mandate and Kill Switch from your NEAR wallet", body: "you commit the Mandate's hash on NEAR and set the Kill Switch there; the engine checks both." },
      { title: "Bonds read-only", body: "registering and topping up a Bond are HyperEVM transactions, so the Bonds page only looks them up in this release." },
    ],
    fixed: [],
    learnMore: [
      { href: "/docs/funds", label: "Deposits and withdrawals" },
      { href: "/risk", label: "Risk Disclosure" },
    ],
  },
  {
    version: "v0.6.0",
    date: "14 November 2026 · 10:27 UTC",
    summary: "See every decision and check it yourself: a live view, Replay with an onchain check, a Leaderboard, and fees that settle each Epoch.",
    added: [
      { title: "Live agent's-eye view", body: "each decision as it happens, with its rationale, Vault value and PnL." },
      { title: "Replay", body: "step through any past decision. Its hash is recomputed in your browser and checked against the onchain DecisionLog, and a tamper sandbox shows the check fail." },
      { title: "Leaderboard", body: "Specialist Agents ranked by risk-adjusted return, with real fills, Bond size and Vaults led. It updates live." },
      { title: "Epoch settlement", body: "fees and premiums settle once per 24-hour Epoch." },
      { title: "A demo Overshoot, settled", body: "real testnet fills past a stop-loss, followed by a claim settled on the ProtectionFund." },
    ],
    improved: [
      { title: "Rationale fallback", body: "Groq writes the rationale when Gemini fails, so a decision is never left unexplained." },
      { title: "Mandate app sidebar", body: "Live trading, Leaderboard, Replay, Deposit and Bonds open in place, and the sidebar collapses to an icon rail." },
      { title: "Legal pages", body: "a new layout with a contents rail that tracks your place." },
    ],
    fixed: [
      { body: "The payout detail page no longer breaks the production build." },
      { body: "The Mandate app no longer errors while the page is being pre-rendered." },
    ],
    learnMore: [
      { href: "/docs/verify", label: "Verify it yourself" },
      { href: "/docs/builders", label: "How agents are ranked" },
    ],
  },
  {
    version: "v0.5.0",
    date: "14 November 2026 · 09:36 UTC",
    summary: "Your controls and your protection: the Veto Window, the Kill Switch, Overshoot settlement, and a second way in from Solana.",
    added: [
      { title: "Kill Switch", body: "the kill flag goes onchain, every position closes, the Lead Agent freezes and withdrawal unlocks." },
      { title: "Veto Window", body: "trades above your veto threshold wait 60 seconds, with a countdown banner, a one-click veto and a second check at expiry." },
      { title: "Overshoot settlement", body: "the Bond pays first, then the Protection Fund, with the Protocol Reserve for Infrastructure Failures. Every settlement is listed with its evidence." },
      { title: "Solana devnet", body: "deposit from and withdraw to Solana, over real CCTP." },
      { title: "Legal pages", body: "Terms of Use, Privacy Policy and Risk Disclosure." },
    ],
    improved: [
      { title: "Full-screen Mandate app", body: "the chat fills the window, with your wallet in the navigation bar." },
      { title: "Live trading chart", body: "a candlestick chart with the agent's entries and stop-losses marked." },
    ],
    fixed: [],
    learnMore: [
      { href: "/docs/controls", label: "Your controls" },
      { href: "/docs/protection", label: "Stop-loss protection" },
    ],
  },
  {
    version: "v0.4.0",
    date: "14 November 2026 · 08:32 UTC",
    summary: "Bonds arrive, and money makes the full round trip: deposit from Base Sepolia, trade on Hyperliquid, withdraw back.",
    added: [
      { title: "Bonds", body: "the AgentRegistry, the Bond Minimum, and a page for Builders to register and bond an agent." },
      { title: "The money round trip", body: "deposit and withdraw with step-by-step progress on the page, and a smoke script that runs the whole trip." },
    ],
    improved: [
      { title: "Homepage", body: "an animated dashboard, richer pillar cards and a fuller market garden." },
    ],
    fixed: [{ body: "Footer links now point at the real pages." }],
    learnMore: [
      { href: "/docs/funds", label: "Deposits and withdrawals" },
      { href: "/docs/builders", label: "Bring an agent" },
    ],
  },
  {
    version: "v0.3.0",
    date: "14 November 2026 · 07:56 UTC",
    summary: "The engine runs on its own, with three agents to choose from and a trade-only key for every Vault.",
    added: [
      { title: "Unattended engine", body: "a runner loop on testnet, a decision feed for the app and restart on crash." },
      { title: "Two more agents", body: "funding-arb and mean-reversion join momentum." },
      { title: "Agent Wallets", body: "each Vault gets a trade-only key held by the engine. It can place and cancel orders but can't withdraw." },
      { title: "Deposit and withdrawal paths", body: "the first half of each: a deposit target per Vault, and withdrawal to Base Sepolia." },
      { title: "Demo Overshoot script", body: "produces real fills past a stop-loss on testnet." },
    ],
    improved: [
      { title: "Homepage motion", body: "the vault mascot and the market garden are animated." },
      { title: "Navigation bar", body: "a blurred fade above the bar and a warmer background." },
    ],
    fixed: [{ body: "Tailwind now uses the documented PostCSS setup." }],
    learnMore: [{ href: "/docs/agents", label: "Agents" }],
  },
  {
    version: "v0.2.0",
    date: "14 November 2026 · 06:54 UTC",
    summary: "The first guarded trade: checked against a Mandate, committed onchain, then sent with its stop-loss.",
    added: [
      { title: "First guarded trade", body: "Mandate Check, Decision Commitment, then the order with a grouped stop-loss." },
      { title: "DecisionLog", body: "the contract that records a Decision Commitment before each order." },
      { title: "Mandate rules and the Automatic Kill", body: "the full Mandate Check, and a stop on new positions at the drawdown cap." },
      { title: "Momentum agent and the Allocator", body: "the first Specialist Agent, with Jev choosing each Vault's Lead Agent among the eligible agents." },
      { title: "Website", body: "the landing page, the design system and the logo." },
    ],
    improved: [{ title: "Navigation and hero", body: "simpler links, a Changelog entry and a lighter headline." }],
    fixed: [],
    learnMore: [
      { href: "/docs/trade-lifecycle", label: "Life of a trade" },
      { href: "/docs/how-it-works", label: "How it works" },
    ],
  },
  {
    version: "v0.1.0",
    date: "14 November 2026 · 06:06 UTC",
    summary: "The foundations: one repository, the Vault and Mandate contracts, and a Mandate you can write in plain English.",
    added: [
      { title: "Monorepo scaffold", body: "contracts, engine and frontend in one repository, with the test seams in place." },
      { title: "Vault and Mandate contracts", body: "Vault, VaultFactory and MandateRegistry on HyperEVM testnet." },
      { title: "Mandate chat", body: "write your rules in plain English, then confirm or edit every field. Blackout windows resolve to exact release times." },
      { title: "Deposit Account", body: "the protocol account that receives every deposit, funded on testnet." },
      { title: "Testnet spike", body: "contract accounts, the Agent Wallet and grouped stop-loss orders, proven on Hyperliquid testnet." },
    ],
    improved: [],
    fixed: [],
    learnMore: [{ href: "/docs/mandate", label: "Vaults and Mandates" }],
  },
];

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
