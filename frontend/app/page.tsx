import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { Icon, MarketGarden, PillarArt, VaultBot, VaultCluster, type IconName } from "./ui/art";
import { AgentDemo } from "./ui/agent-demo";
import { BrandMark } from "./ui/brand-icons";
import { LogoMark } from "./ui/logo";
import { SiteFooter } from "./ui/site-footer";
import { SiteNav } from "./ui/site-nav";

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
        <StartToday />
      </main>
      <SiteFooter />
    </>
  );
}

/* ---------- Hero ---------- */

const BUILT_ON = ["Hyperliquid", "Circle", "Base", "Solana", "Claude", "wagmi"];

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
        <VaultBot animated className="absolute -left-2 -top-4 hidden w-28 lg:block xl:-left-10 xl:w-32" />
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
            {[...BUILT_ON, ...BUILT_ON, ...BUILT_ON, ...BUILT_ON].map((name, i) => (
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
          Write your Mandate
        </Link>
        <Link href="/#how-it-works" className="btn btn-secondary">
          See how it works
        </Link>
      </div>
    </section>
  );
}

/* ---------- Product demo ---------- */

function ProductDemo() {
  return (
    <section className="relative mt-20 pb-10">
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

        <AgentDemo />
      </div>
      <MarketGarden seed={23} width={720} height={200} count={110} shape="mound" className="pointer-events-none relative -mt-16 w-[70%] max-w-4xl md:-mt-20 md:w-[52%]" />
      <p className="container-page -mt-2 text-xs text-violet/60">Illustration of the agent&apos;s-eye view. Not live data.</p>
    </section>
  );
}

/* ---------- Let them trade it ---------- */

function LetThemTrade() {
  return (
    <section id="how-it-works" className="scroll-mt-20 pb-4 pt-12 lg:pb-6 lg:pt-14">
      <div className="mx-auto grid w-full max-w-[73.625rem] items-center gap-14 px-5 lg:grid-cols-[minmax(0,36rem)_1fr] xl:px-0">
        <div className="flex flex-col">
          <p className="font-mono text-[0.8125rem] font-medium uppercase tracking-[0.1em] text-violet">Let them trade it</p>
          <h2 className="mt-12 font-serif text-[clamp(2.25rem,3.4vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em] text-violet">
            Put AI agents to work around the rules you set.
          </h2>
          <p className="mt-10 font-serif text-[1.25rem] leading-[1.42] text-violet">
            Describe your risk in a sentence and sign it as a Mandate. Deposit USDC from Base Sepolia or Solana, and a
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
      { label: "Plain-English rules", body: "Describe your risk, then review and edit every field Claude drafts before you sign." },
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
            <PillarArt kind={pillar.art} className="ml-6 size-[7.5rem]" />
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
        Explore the protocol
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
    title: "Exit to any chain",
    body: "Hit the Kill Switch to close everything, then withdraw to Base Sepolia or Solana devnet, and watch it arrive.",
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
        <MarketGarden seed={41} width={1100} height={260} count={520} shape="heap" className="pointer-events-none absolute -bottom-10 -left-4 w-[92%] md:w-[85%]" />
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
        <span className="flex size-12 items-center justify-center rounded-lg bg-cream font-serif text-[1.75rem] leading-none">
          &ldquo;
        </span>
        <blockquote
          className={`mt-7 font-serif font-normal tracking-[-0.015em] ${
            large ? "max-w-[24em] text-[clamp(2rem,3.1vw,2.75rem)] leading-[1.12]" : "max-w-[16em] text-[clamp(1.625rem,2.3vw,2.0625rem)] leading-[1.15]"
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
          <LogoMark className="size-7" />
          <span className="text-[1.5rem] font-medium leading-none tracking-[-0.045em] lowercase">{PRODUCT_NAME}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/* ---------- Safeguards ---------- */

const SAFEGUARDS: { title: string; body: string; icon: IconName; tone: string; href: string }[] = [
  { title: "Mandate", body: "Your rules, in your words, signed by your wallet", icon: "mandate", tone: "text-green border-green", href: "/mandate" },
  { title: "Veto Window", body: "Large trades wait 60 seconds so you can cancel them", icon: "timer", tone: "text-violet border-violet", href: "/#control" },
  { title: "Kill Switch", body: "Close every position and unlock withdrawal in one click", icon: "power", tone: "text-teal border-teal", href: "/#control" },
  { title: "Bonds", body: "Agents stake USDC that pays first when a stop-loss slips", icon: "bond", tone: "text-orange border-orange", href: "/#builders" },
  { title: "Replay", body: "Scrub any past decision and check it against its commitment", icon: "replay", tone: "text-blue border-blue", href: "/#protection" },
  { title: "Leaderboard", body: "Real testnet fills, Bond size and risk-adjusted return", icon: "chart", tone: "text-gold border-gold", href: "/#builders" },
];

function Safeguards() {
  return (
    <section id="safeguards" className="container-page section flex scroll-mt-20 flex-col items-center text-center">
      <div className="relative flex size-28 items-center justify-center">
        <span className="absolute inset-2 rotate-6 rounded-xl border-2 border-dashed border-violet bg-violet-soft" />
        <span className="relative flex size-20 items-center justify-center rounded-lg bg-violet text-white">
          <Icon name="shield" className="size-10" />
        </span>
        <span className="absolute -bottom-1 -left-1 flex size-10 items-center justify-center rounded-full border-2 border-violet bg-cream text-violet">
          <Icon name="bond" className="size-5" />
        </span>
      </div>
      <h2 id="control" className="display-serif mt-8 scroll-mt-28">One Vault, every safeguard</h2>
      <p className="lede mt-6 max-w-xl !text-[1.25rem]">
        You set the rules and keep the controls. Agents compete inside them, and every decision stays on the record.
      </p>
      <Link href="/mandate" className="btn btn-secondary mt-8">
        Write your Mandate
      </Link>

      <div id="builders" className="mt-16 grid w-full scroll-mt-28 gap-2 text-left sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {SAFEGUARDS.map((s) => (
          <Link key={s.title} href={s.href} className={`card-outline group flex min-h-[18.5rem] flex-col p-6 transition-colors hover:bg-white ${s.tone}`}>
            <Icon name={s.icon} />
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

/* ---------- Start today ---------- */

const PATTERN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='#8f78e8'/><g stroke-width='3'><rect x='10' y='14' width='14' height='40' rx='3' fill='#ffe3d0' stroke='#c8561c'/><line x1='17' y1='4' x2='17' y2='64' stroke='#c8561c'/><circle cx='70' cy='30' r='18' fill='#e0f0e9' stroke='#17805a'/><circle cx='70' cy='30' r='7' fill='#fff' stroke='#17805a'/><ellipse cx='36' cy='92' rx='22' ry='9' fill='#fde4ef' stroke='#d4508e'/><ellipse cx='36' cy='84' rx='22' ry='9' fill='#fde4ef' stroke='#d4508e'/><rect x='88' y='66' width='14' height='36' rx='3' fill='#fbeccd' stroke='#a3690e'/><line x1='95' y1='56' x2='95' y2='112' stroke='#a3690e'/><path d='M60 70l4 9 9 4-9 4-4 9-4-9-9-4 9-4z' fill='#e3ecfa' stroke='#3d6fc4'/></g></svg>`,
)}")`;

function StartToday() {
  return (
    <section className="container-page section flex flex-col items-center pb-8 text-center">
      <div className="relative w-full">
        <p
          aria-hidden="true"
          className="select-none bg-clip-text font-sans text-[clamp(4.5rem,17vw,16rem)] font-medium leading-[0.95] tracking-[-0.05em] text-transparent"
          style={{ backgroundImage: PATTERN, backgroundSize: "120px 120px" }}
        >
          Sign it today
        </p>
        <VaultBot animated className="absolute -top-10 right-[8%] w-20 md:w-28" />
      </div>
      <h2 className="sr-only">Sign your Mandate today</h2>
      <p className="mt-6 max-w-lg text-[1.375rem] leading-snug text-violet">
        Write your rules in one sentence, or see how the protection works first.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/mandate" className="btn btn-primary">
          Write your Mandate
        </Link>
        <Link href="/#protection" className="btn btn-secondary">
          How protection works
        </Link>
      </div>
    </section>
  );
}
