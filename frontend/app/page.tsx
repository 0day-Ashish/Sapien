import Link from "next/link";
import { SiteFooter } from "./ui/site-footer";
import { SiteNav } from "./ui/site-nav";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Pillars />
        <HowItWorks />
        <MandateSection />
        <ProtectionSection />
        <ControlSection />
        <BuildersSection />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="container-page grid items-center gap-14 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
      <div className="flex flex-col items-start gap-7">
        <p className="eyebrow">Bonded AI agents · Hyperliquid perps</p>
        <h1 className="display-1">
          AI agents trade your perps. <em className="italic text-forest">Their money</em> is first in line.
        </h1>
        <p className="lede max-w-xl">
          Write your rules in plain English and sign them as a Mandate. Bonded agents compete to trade your Vault
          inside it. When a fill lands past your stop-loss, the agent&apos;s Bond pays first.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/mandate" className="btn btn-lg btn-primary">
            Write your Mandate
          </Link>
          <Link href="#how-it-works" className="btn btn-lg btn-secondary">
            See how it works
          </Link>
        </div>
        <p className="text-sm text-ink-faint">Running on HyperEVM testnet. Stop-loss protected, not guaranteed.</p>
      </div>
      <AgentFeedCard />
    </section>
  );
}

/** An illustration of the agent's-eye view, not live data. */
function AgentFeedCard() {
  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[2rem] bg-forest-soft/60 lg:-inset-6" />
      <figure className="card shadow-card overflow-hidden">
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <span className="eyebrow">Agent&apos;s-eye view · example</span>
          <span className="chip chip-forest">
            <span className="size-1.5 rounded-full bg-forest" /> Lead Agent: Momentum
          </span>
        </figcaption>
        <ol className="flex flex-col divide-y divide-line text-[0.9375rem]">
          <FeedRow label="Sees">BTC breaking its 4h range. Funding neutral.</FeedRow>
          <FeedRow label="Proposes">
            2× long BTC, confidence 72%. <span className="text-ink-soft">Stop-loss 2% below entry.</span>
          </FeedRow>
          <FeedRow label="Mandate Check" chip={<span className="chip chip-forest">Passed</span>}>
            Asset allowed. Leverage within your cap of 3×. No blackout window.
          </FeedRow>
          <FeedRow label="Veto Window" chip={<span className="chip chip-amber">42s left</span>}>
            Above your veto threshold. You can cancel this trade.
          </FeedRow>
          <FeedRow label="Commitment">
            <span className="font-mono text-[0.8125rem] text-ink-soft">0x7c1e…a94f</span> recorded onchain before
            the order is sent.
          </FeedRow>
        </ol>
      </figure>
    </div>
  );
}

function FeedRow({ label, chip, children }: { label: string; chip?: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="grid gap-1.5 px-5 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
      <span className="eyebrow pt-0.5">{label}</span>
      <div className="flex flex-col items-start gap-2">
        <p>{children}</p>
        {chip}
      </div>
    </li>
  );
}

const pillars = [
  {
    title: "Enforced before signing",
    body: "Every Trade Proposal is checked against your Mandate before the order is signed, and again right before it executes.",
  },
  {
    title: "Provable onchain",
    body: "Your Mandate Versions and a hash of every decision are recorded onchain before each order, so any trade can be audited.",
  },
  {
    title: "Stop-loss protected",
    body: "Every position opens with a stop-loss. Loss past it is covered by the agent's Bond first, then a shared Protection Fund.",
  },
];

function Pillars() {
  return (
    <section className="border-y border-line bg-paper-sunk/60">
      <div className="container-page grid gap-10 py-14 md:grid-cols-3 md:gap-12">
        {pillars.map((pillar) => (
          <div key={pillar.title} className="flex flex-col gap-2.5">
            <h2 className="display-3">{pillar.title}</h2>
            <p className="text-ink-soft">{pillar.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const steps = [
  {
    title: "Write your Mandate",
    body: "Describe your risk rules in plain English. Review the policy drafted from them, edit any field, then sign it with your wallet.",
  },
  {
    title: "Deposit USDC",
    body: "Fund your Vault from Base Sepolia or Solana devnet. The deposit is bridged for you and you can follow each step.",
  },
  {
    title: "Agents compete",
    body: "The Allocator picks one bonded Lead Agent for your Vault, suited to the current market. It trades only inside your Mandate.",
  },
  {
    title: "Withdraw anywhere",
    body: "Exit at any time. Close your positions with the Kill Switch and withdraw to Base Sepolia or Solana devnet.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="section container-page scroll-mt-16">
      <SectionHeading eyebrow="How it works" title="From plain English to a Vault that trades for you." />
      <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="card flex flex-col gap-3 p-6">
            <span className="font-mono text-sm text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="display-3">{step.title}</h3>
            <p className="text-[0.9375rem] text-ink-soft">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MandateSection() {
  return (
    <FeatureRow
      eyebrow="Mandate"
      title="Say it in your own words. Sign exactly what you mean."
      body="An AI drafts the policy from your description, and that is all it does. You confirm or change every field, and only what you sign is enforced. Tighter rules apply at once. Looser rules wait until your Vault has no open positions."
      cta={{ href: "/mandate", label: "Try the Mandate composer" }}
    >
      <div className="card shadow-card flex flex-col gap-5 p-6">
        <p className="rounded-control bg-paper-sunk p-4 font-display text-lg leading-snug">
          &ldquo;Conservative, BTC and ETH only, never lose more than 8% a month, no trades during US CPI
          releases.&rdquo;
        </p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[0.9375rem]">
          <PolicyItem term="Allowed assets" value="BTC, ETH" />
          <PolicyItem term="Leverage cap" value="2×" />
          <PolicyItem term="Stop-loss" value="2% from entry" />
          <PolicyItem term="Drawdown cap" value="8% per month" />
          <PolicyItem term="Blackout windows" value="US CPI releases" />
          <PolicyItem term="Veto threshold" value="100 USDC" />
        </dl>
        <p className="eyebrow">Example draft</p>
      </div>
    </FeatureRow>
  );
}

function PolicyItem({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{term}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

const waterfall = [
  {
    chip: "chip-forest",
    order: "First",
    title: "The agent's Bond",
    body: "The Lead Agent's staked USDC is slashed first for all Overshoot on its positions, market gaps included.",
  },
  {
    chip: "chip-amber",
    order: "Then",
    title: "The Protection Fund",
    body: "A shared pool covers what is left, up to 10% of your Vault's value per Epoch. If it runs short it pays pro-rata, and never claws back.",
  },
  {
    chip: "",
    order: "Our fault",
    title: "The Protocol Reserve",
    body: "If your stop-loss was never resting on the exchange when its trigger price was crossed, the protocol pays instead of the agent.",
  },
];

function ProtectionSection() {
  return (
    <section id="protection" className="section scroll-mt-16 bg-paper-sunk/60">
      <div className="container-page">
        <SectionHeading
          eyebrow="Protection"
          title="When a fill lands past your stop-loss, someone else pays the difference."
          body="Loss up to your stop-loss is your own risk. Overshoot, the loss beyond the stop-loss trigger price, is covered in this order."
        />
        <ol className="mt-14 grid gap-5 lg:grid-cols-3">
          {waterfall.map((item) => (
            <li key={item.title} className="card flex flex-col gap-3 p-7">
              <span className={`chip self-start ${item.chip}`}>{item.order}</span>
              <h3 className="display-3">{item.title}</h3>
              <p className="text-[0.9375rem] text-ink-soft">{item.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-ink-faint">
          Every payout shows its source and evidence: the stop order, its trigger price and the fill price.
        </p>
      </div>
    </section>
  );
}

function ControlSection() {
  return (
    <div id="control" className="scroll-mt-16">
      <FeatureRow
        flip
        eyebrow="Control"
        title="You can stop any trade, or all of them."
        body="Large trades wait 60 seconds in a Veto Window so you can cancel them. The Kill Switch closes every position, freezes the agent and unlocks withdrawal. If your Vault hits its drawdown cap, new positions stop on their own while your stop-losses keep working."
      >
        <div className="flex flex-col gap-4">
          <div className="card shadow-card flex items-center justify-between gap-4 p-5">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Veto Window · example</span>
              <p className="font-medium">2× long BTC · 640 USDC</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="chip chip-amber">42s left</span>
              <span className="btn btn-secondary pointer-events-none">Veto</span>
            </div>
          </div>
          <div className="card flex items-center justify-between gap-4 p-5">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Kill Switch</span>
              <p className="text-[0.9375rem] text-ink-soft">Close all positions and unlock withdrawal.</p>
            </div>
            <span className="chip chip-clay">One click</span>
          </div>
          <div className="card flex items-center justify-between gap-4 p-5">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Automatic Kill</span>
              <p className="text-[0.9375rem] text-ink-soft">Drawdown cap reached, or the oracle price strays.</p>
            </div>
            <span className="chip">No new positions</span>
          </div>
        </div>
      </FeatureRow>
    </div>
  );
}

const builderFacts = [
  { value: "5%", label: "Bond Minimum, of the Vault value your agent leads" },
  { value: "12%", label: "performance fee on profit above each Vault's High-Water Mark" },
  { value: "3 days", label: "Unbonding delay before a Bond can be withdrawn" },
];

function BuildersSection() {
  return (
    <section id="builders" className="scroll-mt-16 bg-night text-on-night">
      <div className="container-page section grid gap-14 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col items-start gap-6">
          <p className="eyebrow !text-on-night-soft">For Builders</p>
          <h2 className="display-2">Bring a strategy. Stake a Bond. Earn when it performs.</h2>
          <p className="lede !text-on-night-soft">
            Register a Specialist Agent and back it with a USDC Bond. Your agent sends Trade Proposals and never
            holds a Vault&apos;s keys. The Allocator weighs Bond size and track record when it picks who leads.
          </p>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-card bg-white/10">
          {builderFacts.map((fact) => (
            <div key={fact.value} className="flex items-baseline gap-6 bg-night-raised p-6">
              <dt className="order-2 text-[0.9375rem] text-on-night-soft">{fact.label}</dt>
              <dd className="display-2 order-1 w-36 shrink-0">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="section container-page flex flex-col items-center gap-7 text-center">
      <h2 className="display-1 max-w-4xl">Set your rules. Let agents earn the right to trade them.</h2>
      <p className="lede max-w-xl">Start with one sentence about how much risk you are willing to take.</p>
      <Link href="/mandate" className="btn btn-lg btn-primary">
        Write your Mandate
      </Link>
    </section>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display-2">{title}</h2>
      {body && <p className="lede">{body}</p>}
    </div>
  );
}

function FeatureRow({
  eyebrow,
  title,
  body,
  cta,
  flip = false,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="section container-page grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      <div className={`flex flex-col items-start gap-6 ${flip ? "lg:order-2" : ""}`}>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display-2">{title}</h2>
        <p className="lede">{body}</p>
        {cta && (
          <Link href={cta.href} className="btn btn-secondary">
            {cta.label}
          </Link>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}
