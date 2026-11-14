import Link from "next/link";
import { Icon, MarketGarden, PillarArt, VaultBot, VaultCluster, type IconName } from "./ui/art";
import { BrandMark } from "./ui/brand-icons";
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
        <span className="flex h-full items-center border-r border-violet px-3 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.08em]">
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
                className="flex items-center gap-2 whitespace-nowrap text-[1.375rem] font-semibold tracking-[-0.025em] text-violet"
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

const TIMELINE = [
  { w: 4, c: "bg-violet" },
  { w: 16, c: "bg-orange" },
  { w: 2, c: "bg-teal" },
  { w: 15, c: "bg-pink" },
  { w: 12, c: "bg-violet-line" },
  { w: 14, c: "bg-violet-line" },
  { w: 18, c: "bg-violet-line" },
  { w: 19, c: "bg-violet-line" },
];

const DECISIONS = [
  { title: "BTC breakout, 2× long", when: "just now", c: "text-green", active: true },
  { title: "ETH funding skew", when: "4m ago", c: "text-teal" },
  { title: "SOL rejected: not allowed", when: "12m ago", c: "text-orange", dot: true },
  { title: "Vetoed: BTC 5× long", when: "1h ago", c: "text-pink" },
  { title: "Stop-loss filled, ETH", when: "3h ago", c: "text-violet" },
  { title: "Overshoot paid by Bond", when: "5h ago", c: "text-gold" },
  { title: "Mandate v3 signed", when: "1d ago", c: "text-blue" },
  { title: "Lead Agent: Momentum", when: "1d ago", c: "text-green" },
  { title: "Deposit landed, 250 USDC", when: "2d ago", c: "text-teal" },
];

function ProductDemo() {
  return (
    <section className="relative mt-6 pb-10">
      <div className="container-page relative">
        {/* Timeline bar */}
        <div className="relative z-10 mt-24 rounded-t-[1.25rem] border border-b-0 border-violet-line bg-violet-tint/90 px-5 py-4 backdrop-blur md:mx-5">
          <span className="chip chip-solid absolute -top-3 left-[22%] md:left-[18%]">Veto window 42s</span>
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="flex gap-[3px]">
              <span className="h-3 w-[3px] bg-violet-ink" />
              <span className="h-3 w-[3px] bg-violet-ink" />
            </span>
            <div className="flex flex-1 items-center gap-1.5">
              {TIMELINE.map((seg, i) => (
                <span key={i} className={`h-[3px] rounded-full ${seg.c}`} style={{ width: `${seg.w}%` }} />
              ))}
            </div>
            <span className="label-mono !text-xs text-violet-ink">0:42 / 2:10</span>
          </div>
        </div>

        {/* Garden spilling over the panel's top-right corner */}
        <MarketGarden
          seed={11}
          width={520}
          height={190}
          count={75}
          shape="mound"
          className="pointer-events-none absolute -right-6 top-0 z-0 hidden w-[42%] max-w-[38rem] -translate-y-[38%] md:block"
        />
        <MarketGarden
          seed={17}
          width={150}
          height={320}
          count={30}
          shape="spray"
          className="pointer-events-none absolute -right-10 top-16 z-0 hidden w-[9rem] lg:block"
        />

        {/* App frame */}
        <div className="relative z-10 grid overflow-hidden rounded-[1.25rem] border border-violet-line bg-violet-soft/70 p-3 shadow-card md:grid-cols-[15rem_1fr]">
          <aside className="hidden flex-col gap-3 p-2 md:flex">
            <div className="grid grid-cols-2 rounded-full bg-white/70 p-1 text-sm text-violet">
              <span className="rounded-full py-1 text-center">Vaults</span>
              <span className="rounded-full bg-white py-1 text-center shadow-sm">Feed</span>
            </div>
            <span className="rounded-full bg-white/70 py-1.5 text-center text-sm text-violet">+ New Mandate</span>
            <p className="mt-2 px-1 text-xs text-violet/70">Recent decisions</p>
            <ul className="flex flex-col gap-1">
              {DECISIONS.map((d) => (
                <li
                  key={d.title}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[0.8125rem] text-violet-ink ${d.active ? "bg-white/80" : ""}`}
                >
                  <Icon name="chart" className={`mt-0.5 size-4 shrink-0 ${d.c}`} />
                  <span className="flex-1 leading-tight">
                    {d.title}
                    <span className="block text-[0.6875rem] text-violet/60">{d.when}</span>
                  </span>
                  {d.dot && <span className="mt-1.5 size-1.5 rounded-full bg-orange" />}
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex min-h-[34rem] flex-col rounded-xl bg-white px-5 py-6 md:px-10">
            <span className="mx-auto rounded-full bg-violet-tint px-3 py-0.5 text-xs text-violet/70">Today</span>
            <div className="mx-auto mt-6 flex w-full max-w-2xl flex-col gap-6">
              <p className="self-end rounded-2xl bg-violet-tint px-4 py-2.5 text-sm text-violet-ink">
                Momentum wants to open 2× long BTC. Why, and is it inside my Mandate?
              </p>
              <div className="flex flex-col gap-2 text-[0.8125rem] text-violet/80">
                <p className="flex items-center gap-2">
                  <Icon name="timer" className="size-4" /> Checked in 3s
                </p>
                <ul className="ml-2 flex flex-col gap-1.5 border-l border-violet-line pl-4">
                  <li>Read Mandate v3</li>
                  <li>Checked blackout windows: none until US CPI, Dec 10</li>
                  <li>Recorded Decision Commitment 0x7c1e…a94f</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 text-sm text-violet-ink">
                <p>Momentum sees BTC breaking its 4h range with funding neutral. Confidence 72%.</p>
                <ul className="ml-5 list-disc space-y-1 marker:text-violet">
                  <li>BTC is an allowed asset, and 2× is under your 3× leverage cap</li>
                  <li>Stop-loss rests 2% below entry, as your Mandate requires</li>
                  <li>
                    <span className="bg-violet-soft px-0.5">640 USDC is above your veto threshold, so it waits 60s for you</span>
                  </li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="chip chip-forest">Mandate check passed</span>
                <span className="chip chip-amber">Veto window 42s</span>
              </div>
            </div>
            <div className="mx-auto mt-auto w-full max-w-2xl rounded-2xl bg-violet-soft/70 p-1.5 pt-0">
              <p className="px-3 py-2 text-xs text-violet/60">Ask about any trade</p>
              <div className="flex flex-col gap-6 rounded-xl border border-violet-line bg-white p-3">
                <p className="text-sm text-violet/50">Why did the agent do that? Or type / for Veto, Kill Switch, Replay…</p>
                <div className="flex items-center justify-between text-violet/60">
                  <span className="text-lg leading-none">+</span>
                  <span className="flex size-7 items-center justify-center rounded-full bg-violet/40 text-sm text-white">↑</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <MarketGarden seed={23} width={720} height={200} count={110} shape="mound" className="pointer-events-none relative -mt-24 w-[70%] max-w-4xl md:-mt-28 md:w-[52%]" />
      <p className="container-page -mt-2 text-xs text-violet/60">Illustration of the agent&apos;s-eye view. Not live data.</p>
    </section>
  );
}

/* ---------- Let them trade it ---------- */

function LetThemTrade() {
  return (
    <section id="how-it-works" className="scroll-mt-20 pb-16 pt-24 lg:pb-24 lg:pt-28">
      <div className="mx-auto grid w-full max-w-[73.625rem] items-center gap-14 px-5 lg:grid-cols-[minmax(0,36rem)_1fr] xl:px-0">
        <div className="flex flex-col">
          <p className="font-mono text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-violet">Let them trade it</p>
          <h2 className="mt-12 font-serif text-[clamp(2.25rem,3.4vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em] text-violet">
            Put AI agents to work around the rules you set.
          </h2>
          <p className="mt-10 font-serif text-[1.25rem] leading-[1.42] text-violet">
            Describe your risk in a sentence and sign it as a Mandate. Deposit USDC from Base Sepolia or Solana, and a
            bonded agent trades your own Vault inside those rules. From first sentence to withdrawal, there&apos;s one
            Vault, one Mandate and a record of every decision.
          </p>
        </div>
        <div className="lg:-mr-[max(0px,calc((100vw-73.625rem)/2))]">
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
    <section className="container-page section flex flex-col items-center">
      <div className="grid w-full gap-6 lg:grid-cols-3">
        {PILLARS.map((pillar) => (
          <article key={pillar.title} className={`card-outline flex flex-col pt-6 ${pillar.tone}`}>
            <PillarArt kind={pillar.art} className="ml-6 size-24" />
            <h3 className="display-3 mt-24 px-6 pb-6">{pillar.title}</h3>
            {pillar.rows.map((row) => (
              <div key={row.label} className="ml-6 border-t border-current py-4 pr-6">
                <p className="label-mono">{row.label}</p>
                <p className="mt-1.5 text-[0.9375rem] leading-snug">{row.body}</p>
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
      <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-violet-line bg-violet-soft px-6 pb-56 pt-14 md:px-14 md:pb-64 md:pt-16">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-7">
            <h2 className="display-1 !text-[clamp(2.5rem,4.4vw,3.75rem)]">One protected Vault</h2>
            <p className="body-violet max-w-lg !text-[1.1875rem]">
              Rules are only the start. Your Vault checks every trade against them, records every decision, and covers
              loss past your stop-loss with the agent&apos;s own money first.
            </p>
          </div>
          <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2">
            {PROTECTION.map((item) => (
              <div key={item.title} className="flex flex-col gap-3 text-violet">
                <h3 className="title-serif max-w-[12em]">{item.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
        <MarketGarden seed={41} width={900} height={190} count={140} shape="mound" className="pointer-events-none absolute -bottom-6 left-0 w-[90%] md:w-[65%]" />
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
        who="Design decision"
        role="How the Mandate is enforced"
        tag="ADR-0003"
      />
      <QuoteCard
        tone="bg-orange-soft text-orange"
        quote="Every agent trading your money has its own money first in line."
        who="Design decision"
        role="Who pays for Overshoot"
        tag="ADR-0002"
        large
      />
    </section>
  );
}

function QuoteCard({ tone, quote, who, role, tag, large = false }: { tone: string; quote: string; who: string; role: string; tag: string; large?: boolean }) {
  return (
    <figure className={`flex min-h-[22rem] flex-col justify-between rounded-[1.25rem] p-6 ${tone}`}>
      <div>
        <span className="flex size-12 items-center justify-center rounded-lg bg-white/80 font-serif text-3xl leading-none">“</span>
        <blockquote className={`mt-6 max-w-[20em] font-serif leading-[1.12] tracking-[-0.015em] ${large ? "text-[clamp(1.75rem,3vw,2.75rem)]" : "text-[clamp(1.5rem,2.3vw,2.125rem)]"}`}>
          {quote}
        </blockquote>
      </div>
      <figcaption className="flex items-end justify-between border-t border-current/30 pt-5 text-[0.9375rem]">
        <span>
          <span className="block font-semibold">{who}</span>
          {role}
        </span>
        <span className="label-mono text-lg">{tag}</span>
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
          className="select-none bg-clip-text font-sans text-[clamp(4.5rem,17vw,16rem)] font-bold leading-[0.95] tracking-[-0.05em] text-transparent"
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
