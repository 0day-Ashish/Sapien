import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { Icon, MarketGarden, PillarArt, SafeguardSeal, VaultCluster, type IconName } from "./ui/art";
import { AgentDemo } from "./ui/agent-demo";
import { BrandMark } from "./ui/brand-icons";
import { FaqList } from "./ui/faq-list";
import { WaveText } from "./ui/wave-text";
import { LogoMark } from "./ui/logo";
import { SiteFooter } from "./ui/site-footer";
import { SiteNav } from "./ui/site-nav";
import { routeMetadata } from "@/lib/site";

export const metadata: Metadata = routeMetadata("/");

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 overflow-x-clip">
        <Hero />
        <ProductDemo />
        <LetThemTrade />
        <Pillars />
        <ProtectionPanel />
        <Principles />
        <Safeguards />
        <Faq />
        <StartToday />
      </main>
      <SiteFooter />
    </>
  );
}

/* ---------- Hero ---------- */

const BUILT_ON = ["Hyperliquid", "NEAR"];
// The strip slides left by half its width and repeats, so half of it has to be wider than any screen.
const BUILT_ON_STRIP = Array.from({ length: 12 }, () => BUILT_ON).flat();

function Hero() {
  return (
    <section className="container-page flex flex-col items-center pt-10 text-center md:pt-14">
      <Link
        href="/#how-it-works"
        className="inline-flex h-[1.875rem] items-center overflow-hidden rounded-full border border-violet text-violet transition-colors hover:bg-violet-tint"
      >
        <span className="flex h-full items-center border-r border-violet px-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em]">
          Testnet
        </span>
        <span className="flex items-center gap-1.5 px-3 text-sm font-medium">
          Agents are live on testnet <span aria-hidden="true">→</span>
        </span>
      </Link>

      <div className="relative mt-10 w-full max-w-6xl">
        <h1 className="display-1 mx-auto max-w-[17em]">
          AI agents can trade your perps.
          <br className="hidden md:block" /> Make them put their money first.
        </h1>
      </div>

      <p className="lede mt-7 max-w-3xl">
        Plain-English rules, bonded agents and stop-loss protection, in one Vault.
      </p>

      <div className="mt-12 w-full">
        <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <ul className="animate-marquee flex w-max items-center gap-16" aria-label="Built on">
            {BUILT_ON_STRIP.map((name, i) => (
              <li
                key={i}
                aria-hidden={i >= BUILT_ON.length}
                className="flex items-center gap-2 whitespace-nowrap text-[1.375rem] font-medium tracking-[-0.025em] text-violet"
              >
                <BrandMark name={name} className="h-[1.2rem] w-auto" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-3">
        <Link href="/mandate" className="btn btn-primary">
          Set your rules
        </Link>
        <Link href="/#how-it-works" className="btn btn-secondary">
          Watch it trade
        </Link>
      </div>
    </section>
  );
}

/* ---------- Product demo ---------- */

function ProductDemo() {
  return (
    <section className="relative mt-20 pb-36 md:pb-44">
      <div className="container-page relative">
        {/* Garden behind the panel's top-right corner */}
        <MarketGarden
          seed={11}
          width={520}
          height={190}
          count={75}
          shape="mound"
          className="pointer-events-none absolute -right-6 top-0 z-0 hidden w-[42%] max-w-[38rem] -translate-y-[45%] md:block"
        />
        <MarketGarden
          seed={17}
          width={150}
          height={320}
          count={30}
          shape="spray"
          className="pointer-events-none absolute -right-10 top-16 z-0 hidden w-[9rem] lg:block"
        />

        {/* And one behind the bottom-left corner, mirroring the top right: its base hangs below the timeline bar */}
        <MarketGarden
          seed={23}
          width={520}
          height={190}
          count={75}
          shape="mound"
          className="pointer-events-none absolute -left-6 bottom-0 z-0 w-[70%] max-w-[38rem] translate-y-[52%] md:w-[42%]"
        />

        <AgentDemo />
      </div>
    </section>
  );
}

/* ---------- Let them trade it ---------- */

function LetThemTrade() {
  return (
    <section id="how-it-works" className="scroll-mt-20 pb-14 pt-12 lg:pb-24 lg:pt-14">
      <div className="mx-auto grid w-full max-w-[73.625rem] items-center gap-14 px-5 lg:grid-cols-[minmax(0,36rem)_1fr] xl:px-0">
        <div className="flex flex-col">
          <p className="font-mono text-[0.8125rem] font-medium uppercase tracking-[0.1em] text-violet">Let them trade it</p>
          <h2 className="mt-12 font-serif text-[clamp(2.25rem,3.4vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em] text-violet">
            Put AI agents to work around the rules you set.
          </h2>
          <p className="mt-10 font-serif text-[1.25rem] leading-[1.42] text-violet">
            Describe your risk in a sentence and commit it as a Mandate. Deposit test USDC from your NEAR wallet, and a
            bonded agent trades your own Vault inside those rules. From first sentence to withdrawal, there&apos;s one
            Vault, one Mandate and a record of every decision.
          </p>
        </div>
        {/* Runs off the right edge of the screen; main clips the overflow. */}
        <div className="-mr-5 lg:-mr-[max(1.25rem,calc((100vw-73.625rem)/2))]">
          <VaultCluster className="h-auto w-full" />
        </div>
      </div>
    </section>
  );
}

/* ---------- Three pillars ---------- */

const PILLARS = [
  {
    art: "mandate" as const,
    title: "Mandate",
    tone: "text-violet border-violet",
    rows: [
      { label: "Plain-English rules", body: "Describe your risk, then review and edit every field the AI drafts before you sign." },
      { label: "Versioned onchain", body: "Tighter rules apply at once. Looser rules wait until your Vault has no open positions." },
    ],
  },
  {
    art: "execute" as const,
    title: "Execute",
    tone: "text-orange border-orange",
    rows: [
      { label: "Checked before signing", body: "Every Trade Proposal passes the Mandate Check before the order is signed, and again before it runs." },
      { label: "Trade-only keys", body: "The Agent Wallet can place and cancel orders. It can never withdraw your funds." },
    ],
  },
  {
    art: "protect" as const,
    title: "Protect",
    tone: "text-green border-green",
    rows: [
      { label: "Bonded agents", body: "Every Lead Agent stakes USDC that is slashed first when a fill lands past your stop-loss." },
      { label: "Shared Protection Fund", body: "What the Bond can't cover is paid from a pooled fund, up to 10% of your Vault per Epoch." },
    ],
  },
];

function Pillars() {
  return (
    <section className="container-page section flex flex-col items-center !pt-16">
      {/* Cards share one row grid (subgrid), so titles, dividers and rows line up across all three. */}
      <div className="grid w-full gap-6 lg:grid-cols-3 lg:grid-rows-[auto_1fr_auto_auto_auto] lg:gap-y-0">
        {PILLARS.map((pillar) => (
          <article
            key={pillar.title}
            className={`card-outline flex flex-col rounded-[0.875rem] pt-6 lg:row-span-5 lg:grid lg:grid-rows-subgrid ${pillar.tone}`}
          >
            <PillarArt kind={pillar.art} className="ml-3 h-44 w-auto self-start" />
            <span aria-hidden="true" className="min-h-16 lg:min-h-36" />
            <h3 className="px-6 pb-9 font-sans text-[2.25rem] font-normal leading-none tracking-[-0.02em]">{pillar.title}</h3>
            {pillar.rows.map((row) => (
              <div key={row.label} className="ml-6 border-t border-current pb-6 pr-6 pt-5">
                <p className="font-mono text-[0.9375rem] font-medium tracking-[0.04em]">{row.label}</p>
                <p className="mt-2 text-[1.0625rem] leading-[1.4]">{row.body}</p>
              </div>
            ))}
          </article>
        ))}
      </div>
      <Link href="/#protection" className="btn btn-gradient mt-14">
        See how you&apos;re protected
      </Link>
    </section>
  );
}

/* ---------- Protection panel ---------- */

const PROTECTION = [
  {
    title: "Agents never hold your keys",
    body: "Builders send Trade Proposals. Only the Execution Engine signs, with a key that can trade but never withdraw.",
  },
  {
    title: "Every decision on the record",
    body: "A hash of each decision is committed onchain before its order is sent, so any trade can be replayed and checked.",
  },
  {
    title: "The agent pays first",
    body: "Overshoot past your stop-loss is slashed from the Lead Agent's Bond, market gaps included, before any shared money is touched.",
  },
  {
    title: "Exit on NEAR",
    body: "Hit the Kill Switch to close everything, then withdraw to your NEAR wallet, and watch it arrive.",
  },
];

function ProtectionPanel() {
  return (
    <section id="protection" className="container-page scroll-mt-20">
      <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-violet-line bg-violet-soft px-6 pb-64 pt-14 md:px-14 md:pb-80 md:pt-16">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-7">
            <h2 className="display-1 !text-[clamp(2.5rem,4.4vw,3.75rem)]">One protected Vault</h2>
            <p className="body-violet max-w-lg !text-[1.1875rem]">
              Rules are only the start. Your Vault checks every trade against them, records every decision, and covers
              loss past your stop-loss with the agent&apos;s own money first.
            </p>
          </div>
          <div className="grid gap-x-14 gap-y-16 sm:grid-cols-2">
            {PROTECTION.map((item) => (
              <div key={item.title} className="flex flex-col gap-5 text-violet">
                <h3 className="max-w-[11em] font-serif text-[1.625rem] font-semibold leading-[1.05] tracking-[-0.02em]">
                  {item.title}
                </h3>
                <p className="max-w-[20em] text-[1.0625rem] leading-[1.45]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
        <MarketGarden seed={41} width={1100} height={260} count={360} shape="heap" className="pointer-events-none absolute -bottom-10 -left-4 w-[92%] md:w-[85%]" />
      </div>
    </section>
  );
}

/* ---------- Principles (quote cards) ---------- */

function Principles() {
  return (
    <section className="container-page mt-6 grid gap-6 lg:grid-cols-[1fr_1.9fr]">
      <QuoteCard
        tone="bg-teal-soft text-teal"
        quote="Enforced before signing, provable onchain."
        who="How the Mandate is enforced"
        role="Design decision · ADR-0003"
      />
      <QuoteCard
        tone="bg-orange-soft text-orange"
        quote="Every agent trading your money has its own money first in line."
        who="Who pays for Overshoot"
        role="Design decision · ADR-0002"
        large
      />
    </section>
  );
}

function QuoteCard({ tone, quote, who, role, large = false }: { tone: string; quote: string; who: string; role: string; large?: boolean }) {
  return (
    <figure className={`flex min-h-[27rem] flex-col justify-between rounded-[1.25rem] p-6 ${tone}`}>
      <div>
        <span className="flex size-12 items-center justify-center rounded-lg bg-cream font-serif text-[3rem] leading-none">
          {/* The glyph sits high in its line box, so nudge it down to the optical centre. */}
          <span className="translate-y-[0.24em]">&ldquo;</span>
        </span>
        <blockquote
          className={`mt-7 font-serif text-[clamp(1.625rem,2.3vw,2.0625rem)] font-normal leading-[1.15] tracking-[-0.015em] ${
            large ? "max-w-[24em]" : "max-w-[16em]"
          }`}
        >
          {quote}
        </blockquote>
      </div>
      <figcaption className="flex items-end justify-between gap-6 border-t border-current/40 pt-6 text-[0.9375rem] leading-[1.45]">
        <span>
          <span className="block font-medium">{who}</span>
          {role}
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-violet-ink">
          <LogoMark className="h-6 w-auto" accent="currentColor" />
          <span className="text-[1.5rem] font-medium leading-none tracking-[-0.045em] lowercase">{PRODUCT_NAME}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/* ---------- Safeguards ---------- */

const SAFEGUARDS: { title: string; body: string; icon: IconName; tone: string; href: string }[] = [
  { title: "Mandate", body: "Your rules, in your words, committed from your NEAR wallet", icon: "mandate", tone: "text-green border-green", href: "/mandate" },
  { title: "Veto Window", body: "Large trades wait 60 seconds so you can cancel them", icon: "timer", tone: "text-violet border-violet", href: "/#control" },
  { title: "Kill Switch", body: "Close every position and unlock withdrawal in one click", icon: "power", tone: "text-teal border-teal", href: "/#control" },
  { title: "Bonds", body: "Agents stake USDC that pays first when a stop-loss slips", icon: "bond", tone: "text-orange border-orange", href: "/#builders" },
  { title: "Replay", body: "Scrub any past decision and check it against its commitment", icon: "replay", tone: "text-blue border-blue", href: "/#protection" },
  { title: "Leaderboard", body: "Real testnet fills, Bond size and risk-adjusted return", icon: "chart", tone: "text-gold border-gold", href: "/#builders" },
];

function Safeguards() {
  return (
    <section id="safeguards" className="container-page section flex scroll-mt-20 flex-col items-center text-center">
      <SafeguardSeal className="h-40 w-auto md:h-48" />
      <h2 id="control" className="display-serif mt-8 scroll-mt-28">One Vault, every safeguard</h2>
      <p className="lede mt-6 max-w-xl !text-[1.25rem]">
        You set the rules and keep the controls. Agents compete inside them, and every decision stays on the record.
      </p>
      <Link href="/mandate" className="btn btn-secondary mt-8">
        Start with a Mandate
      </Link>

      <div id="builders" className="mt-16 grid w-full scroll-mt-28 gap-2 text-left sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {SAFEGUARDS.map((s) => (
          <Link key={s.title} href={s.href} className={`card-outline group flex min-h-[13rem] sm:min-h-[18.5rem] flex-col p-6 transition-colors hover:bg-white ${s.tone}`}>
            <Icon name={s.icon} className="size-9" />
            <h3 className="display-3 mt-8 !text-[2rem]">{s.title}</h3>
            <p className="mt-2 text-[0.9375rem] font-medium leading-snug">{s.body}</p>
            <span className="label-mono mt-auto pt-8 !text-xs uppercase tracking-[0.1em]">
              Learn more <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: `What is ${PRODUCT_NAME}?`,
    a: "An arena where bonded AI agents trade perpetual futures on Hyperliquid for your Vault. Every trade has to fit the Mandate you write and sign, and the agent's own Bond pays first when a stop-loss fills worse than its trigger.",
  },
  {
    q: "Is this real money?",
    a: (
      <>
        No. {PRODUCT_NAME} runs on test networks only: Hyperliquid testnet, HyperEVM testnet and NEAR testnet. Test tokens
        have no monetary value. The <Link href="/risk">Risk Disclosure</Link> has the detail.
      </>
    ),
  },
  {
    q: "Can an agent withdraw my funds?",
    a: "No. Each Vault has an Agent Wallet, a trade-only key that can place and cancel orders but can't withdraw. Only the Vault's owner can withdraw, and only while the Vault has no open positions.",
  },
  {
    q: "What is a Mandate?",
    a: (
      <>
        The policy your Vault trades under, committed from your NEAR wallet: allowed assets, leverage cap, stop-loss, drawdown cap, blackout windows
        and a veto threshold. You write it in plain English and confirm or edit every field before signing.{" "}
        <Link href="/docs/mandate">See it field by field</Link>.
      </>
    ),
  },
  {
    q: "What happens if a stop-loss fills past its trigger?",
    a: (
      <>
        The difference is called Overshoot. The agent&apos;s Bond pays it first. If no stop-loss was resting when the trigger was crossed, the
        Protocol Reserve pays instead. The shared Protection Fund covers what is left, up to 10% of your Vault per Epoch. It is stop-loss
        protection, never a guarantee. <Link href="/docs/protection">How protection works</Link>.
      </>
    ),
  },
  {
    q: "Can I stop a trade or stop everything?",
    a: "Yes. Trades above your veto threshold wait 60 seconds, and one click cancels them. The Kill Switch closes every position, freezes the Lead Agent and unlocks withdrawal.",
  },
  {
    q: "How do I know the agent followed my rules?",
    a: (
      <>
        A hash of every decision is written onchain before its order is sent. <Link href="/replay">Replay</Link> recomputes that hash in your
        browser and checks it against the chain, so a record that was changed afterwards shows a mismatch.
      </>
    ),
  },
  {
    q: "Can I bring my own agent?",
    a: (
      <>
        Yes. Register a Specialist Agent and post its Bond on <Link href="/builders">Bring an agent</Link>. The Bond Minimum is 5% of the
        combined value of the Vaults your agent leads.
      </>
    ),
  },
];

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="container-page section grid scroll-mt-20 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="eyebrow">FAQ</p>
        <h2 id="faq-title" className="display-serif mt-6">
          Questions, answered
        </h2>
        <p className="mt-5 max-w-sm text-[1.0625rem] leading-relaxed text-violet">
          The short answers. The <Link href="/docs" className="underline decoration-violet/30 underline-offset-4 hover:decoration-violet">docs</Link> go
          deeper, and you can always <Link href="/contact" className="underline decoration-violet/30 underline-offset-4 hover:decoration-violet">ask us</Link>.
        </p>
      </div>
      <FaqList items={FAQS} />
    </section>
  );
}

/* ---------- Start today ---------- */

function StartToday() {
  return (
    <section className="container-page section flex flex-col items-center pb-8 text-center">
      <div className="relative w-full">
        <p
          aria-hidden="true"
          className="w-full select-none font-sans text-[clamp(3.5rem,13vw,13rem)] font-medium leading-[1.05] tracking-[-0.05em] text-violet"
        >
          <WaveText text="Sign it today" />
        </p>
      </div>
      <h2 className="sr-only">Sign your Mandate today</h2>
      <p className="mt-6 max-w-lg text-[1.375rem] leading-snug text-violet">
        Write your rules in one sentence, or see how the protection works first.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/mandate" className="btn btn-primary">
          Sign your Mandate
        </Link>
        <Link href="/#protection" className="btn btn-secondary">
          See the protection first
        </Link>
      </div>
    </section>
  );
}
