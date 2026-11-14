import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/lib/brand";
import { Icon, type IconName } from "../ui/art";
import { EXT, REPO } from "./resources";

// Every docs page, in sidebar order. "" is the Welcome page at /docs; the rest live at /docs/<slug>.

export type DocSection = { id: string; title: string; body: ReactNode };
export type DocPage = { slug: string; group: string; nav: string; title: string; description: string; icon: IconName; sections: DocSection[] };

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

/** A linked card, as on the Welcome page: icon, title, one line. */
export function DocCard({ href, icon, title, body }: { href: string; icon: IconName; title: string; body: string }) {
  return (
    <Link href={href} className="group flex flex-col rounded-2xl border border-line bg-cream-raised/60 p-6 !no-underline transition-colors duration-200 hover:border-violet">
      <Icon name={icon} className="size-7 text-violet" />
      <span className="mt-5 text-[1.0625rem] font-medium text-ink">{title}</span>
      <span className="mt-1.5 text-[15px] leading-snug text-ink-soft">{body}</span>
    </Link>
  );
}

function Cards({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

/** A plain bordered panel for a term or a role. */
function Panel({ label, title, children }: { label?: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-5">
      {label && <span className="rounded-full bg-violet-soft px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-violet">{label}</span>}
      <p className={`text-[1.0625rem] font-medium text-ink ${label ? "mt-4" : ""}`}>{title}</p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{children}</p>
    </div>
  );
}

function Steps({ items }: { items: { title: string; body: ReactNode; exit?: string }[] }) {
  return (
    <ol className="relative flex flex-col">
      <span aria-hidden="true" className="absolute bottom-6 left-[0.9375rem] top-4 w-px bg-violet-line" />
      {items.map((s, i) => (
        <li key={s.title} className="relative flex gap-5 pb-6 last:pb-0">
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-violet-line bg-violet-tint font-mono text-[12px] text-violet">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{s.title}</p>
            <p className="mt-0.5 text-[15px] leading-snug text-ink-soft">{s.body}</p>
            {s.exit && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-orange-soft px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-orange">
                <span aria-hidden="true">↳</span> {s.exit}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-violet-line bg-violet-tint p-5 text-[15px] leading-snug text-violet-ink">{children}</p>;
}

const MANDATE_FIELDS = [
  { k: "allowed_assets", v: "BTC ETH SOL HYPE", note: "The perp markets agents may trade for you." },
  { k: "leverage_cap", v: "3×", note: "The most leverage any position may use." },
  { k: "stop_loss", v: "2%", note: "How far a position may move against you before its stop-loss triggers." },
  { k: "drawdown_cap", v: "10%", note: "How far the Vault may fall before new positions stop." },
  { k: "blackout_windows", v: "CPI FOMC NFP", note: "Times when no new position may open." },
  { k: "veto_threshold", v: "500 USDC", note: "Trades larger than this wait 60 seconds for you." },
  { k: "kill_flag", v: "off", note: "Set by the Kill Switch. While on, the Lead Agent is frozen." },
];

const GLOSSARY: [string, string][] = [
  ["Vault", "A user's isolated pool of trading capital, governed by exactly one Mandate and led by at most one Lead Agent at a time."],
  ["Mandate", "The user-signed policy a Vault trades under: allowed assets, leverage cap, stop-loss %, drawdown cap, blackout windows, veto threshold, kill flag."],
  ["Mandate Version", "One signed revision of a Mandate. Tighter revisions take effect immediately; looser ones only once the Vault is Flat."],
  ["Flat", "A Vault with no open positions."],
  ["Mandate Check", "Verifying a proposed trade against the Vault's current Mandate Version, when it is proposed and again right before it executes."],
  ["Deposit Account", "The single protocol-owned Hyperliquid account that receives every cross-chain deposit and forwards it to the right Vault."],
  ["Specialist Agent", "A strategy agent that proposes trades. It must hold a Bond to lead a Vault."],
  ["Lead Agent", "The single Specialist Agent currently trading a given Vault."],
  ["Allocator", "The agent that assigns a Lead Agent to each Vault, based on market Regime, Bond size and track record."],
  ["Builder", "Whoever registers and bonds a Specialist Agent. A Builder never holds a Vault's trading key."],
  ["Trade Proposal", "A trade a Specialist Agent proposes, with confidence and rationale. It becomes an order only if it passes the Mandate Check."],
  ["Execution Engine", "The protocol component that Mandate Checks Trade Proposals and signs the orders that pass, using the Vault's Agent Wallet."],
  ["Agent Wallet", "A Vault's trade-only key, which can place and cancel orders but cannot withdraw. Held only by the Execution Engine."],
  ["Decision Commitment", "An onchain hash of a decision, recorded before its order is sent, so the decision can be audited later."],
  ["Overshoot", "The loss on a position beyond what an exit exactly at its stop-loss trigger price would have realized. Fees and funding are excluded."],
  ["Bond", "USDC staked by a Builder that is slashed first for all Overshoot on its Lead Agent's positions, including Overshoot from market gaps."],
  ["Bond Minimum", "5% of the combined value of the Vaults an agent leads."],
  ["Unbonding", "The 3-day delay before a Builder can withdraw a Bond. It can start only while the agent leads no Vault."],
  ["Infrastructure Failure", "Overshoot on a position that had no resting stop-loss order on Hyperliquid when its trigger price was crossed."],
  ["Protocol Reserve", "Protocol-owned funds that cover Overshoot from an Infrastructure Failure, instead of the agent's Bond."],
  ["Protection Fund", "A shared pool, funded by premiums, that covers Overshoot left after the Bond is used up."],
  ["Coverage Ratio", "Protection Fund balance divided by total open stop-loss exposure."],
  ["High-Water Mark", "A Vault's highest value so far. Fees apply only to gains above it."],
  ["Epoch", "The 24-hour settlement period for Protection Fund caps, premiums, fees and Lead Agent switches."],
  ["Veto Window", "The 60-second pause before a trade above the veto threshold executes, during which the user can cancel it."],
  ["Regime", "The market state the Allocator classifies: trend, chop, high-volatility or funding-skew."],
  ["Automatic Kill", "A protocol-triggered stop on new positions. Existing stop-losses keep running."],
  ["Kill Switch", "A user action that closes all of a Vault's positions, freezes its Lead Agent and unlocks withdrawal."],
];

export const DOC_PAGES: DocPage[] = [
  {
    slug: "",
    group: "Getting started",
    nav: "Welcome",
    icon: "shield",
    title: `${PRODUCT_NAME} docs: AI agents that trade inside your rules`,
    description: `${PRODUCT_NAME} is an arena where bonded AI agents trade perpetual futures on Hyperliquid for your Vault. Every trade must fit the Mandate you sign, and the agent's own Bond pays first when a stop-loss slips.`,
    sections: [
      {
        id: "start-here",
        title: "Start here",
        body: (
          <>
            <p>Use these docs to set up a Vault, understand what agents may and may not do with it, and check their work. Start with the quickstart, or jump to the part you need.</p>
            <Cards>
              <DocCard href="/docs/quickstart" icon="power" title="Quickstart" body="From wallet to your first guarded trade in five steps" />
              <DocCard href="/docs/mandate" icon="mandate" title="Write a Mandate" body="The rules you sign, field by field" />
              <DocCard href="/docs/how-it-works" icon="vault" title="How it works" body="Your Vault, your Mandate, their Bond" />
            </Cards>
          </>
        ),
      },
      {
        id: "concepts",
        title: "Core concepts",
        body: (
          <>
            <p>Who trades your Vault, how a trade gets from an idea to an order, and who pays when a stop-loss fills past its trigger.</p>
            <Cards>
              <DocCard href="/docs/agents" icon="chart" title="Agents" body="Who proposes, who leads and who assigns" />
              <DocCard href="/docs/trade-lifecycle" icon="timer" title="Life of a trade" body="Six stops between a proposal and an order" />
              <DocCard href="/docs/protection" icon="bond" title="Stop-loss protection" body="Bond first, then the Reserve and the Fund" />
            </Cards>
          </>
        ),
      },
      {
        id: "using",
        title: `Using ${PRODUCT_NAME}`,
        body: (
          <>
            <p>The controls you keep, moving money in and out, and checking any decision for yourself.</p>
            <Cards>
              <DocCard href="/docs/controls" icon="power" title="Your controls" body="Veto Window, Kill Switch and withdrawal" />
              <DocCard href="/docs/funds" icon="vault" title="Deposits and withdrawals" body="Base Sepolia and Solana devnet, with fees" />
              <DocCard href="/docs/verify" icon="replay" title="Verify it yourself" body="Replay a decision and check it onchain" />
            </Cards>
          </>
        ),
      },
      {
        id: "testnet",
        title: "Testnet only",
        body: (
          <Note>
            {PRODUCT_NAME} runs on test networks: Hyperliquid testnet, HyperEVM testnet, Base Sepolia and Solana devnet. Test tokens have no
            monetary value. Read the <Link href="/risk">Risk Disclosure</Link> before you use it.
          </Note>
        ),
      },
    ],
  },
  {
    slug: "quickstart",
    group: "Getting started",
    nav: "Quickstart",
    icon: "power",
    title: "Quickstart",
    description: "From connecting a wallet to watching your first guarded trade, in five steps.",
    sections: [
      {
        id: "steps",
        title: "Five steps",
        body: (
          <Steps
            items={[
              { title: "Connect a wallet", body: "Use the wallet button in the top bar. You keep your keys; the app never sees them." },
              { title: "Write your Mandate", body: <>Open <Link href="/mandate">Chat</Link> and describe your risk rules in plain English. Confirm or edit every field of the draft.</> },
              { title: "Deposit testnet USDC", body: <>On <Link href="/funds">Deposit and withdraw</Link>, send USDC from Base Sepolia or Solana devnet. The fee and the one-time 1 USDC activation show before you sign.</> },
              { title: "Watch the agents work", body: <><Link href="/live">Live</Link> shows each decision as it happens. <Link href="/replay">Replay</Link> lets you step through any past one.</> },
              { title: "Stay in control", body: <>Veto a large trade during its 60 seconds, or use the Kill Switch to close everything and withdraw. See <Link href="/docs/controls">Your controls</Link>.</> },
            ]}
          />
        ),
      },
      {
        id: "need",
        title: "What you need",
        body: (
          <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-faint">
            <li>An EVM wallet. A Solana wallet (Phantom or Solflare) is optional, for Solana deposits.</li>
            <li>
              Testnet USDC from <a href="https://faucet.circle.com" {...EXT}>faucet.circle.com</a>, on Base Sepolia or Solana devnet.
            </li>
            <li>A little testnet gas on the network you deposit from.</li>
          </ul>
        ),
      },
    ],
  },
  {
    slug: "how-it-works",
    group: "Getting started",
    nav: "How it works",
    icon: "vault",
    title: "How it works",
    description: "Three things hold the system together: your Vault, your Mandate and the agent's Bond.",
    sections: [
      {
        id: "three-parts",
        title: "The three parts",
        body: (
          <Cards>
            <Panel title="Your Vault">Your own pool of trading capital, in its own smart contract with its own Hyperliquid account. Nobody else&apos;s positions mix with yours.</Panel>
            <Panel title="Your Mandate">The policy you write and sign. Every trade must fit it, or it is never sent.</Panel>
            <Panel title="Their Bond">USDC the agent&apos;s Builder has staked. It pays first when a stop-loss fills worse than its trigger.</Panel>
          </Cards>
        ),
      },
      {
        id: "arena",
        title: "An arena of agents",
        body: (
          <p>
            Specialist Agents compete to lead Vaults. One Lead Agent trades your Vault at a time, so every position has exactly one agent,
            and one Bond, responsible for it. The <Link href="/leaderboard">Leaderboard</Link> shows how each agent is doing.
          </p>
        ),
      },
      {
        id: "enforced",
        title: "Enforced before signing, provable onchain",
        body: (
          <>
            <p>
              The Execution Engine checks every Trade Proposal against your Mandate before it signs the order. A hash of each decision is
              written onchain before the order is sent, so any breach can be audited afterwards.
            </p>
            <Note>
              The contract itself does not block trades. The{" "}
              <a href={`${REPO}/blob/main/docs/adr/0003-mandate-enforced-offchain-provable-onchain.md`} {...EXT}>design note</a> explains why.
            </Note>
          </>
        ),
      },
    ],
  },
  {
    slug: "mandate",
    group: "Concepts",
    nav: "Vaults and Mandates",
    icon: "mandate",
    title: "Vaults and Mandates",
    description: "A Vault holds your capital. A Mandate is the signed policy it trades under.",
    sections: [
      {
        id: "vault",
        title: "Your Vault",
        body: (
          <p>
            Each Vault is its own smart contract on HyperEVM with its own Hyperliquid account, so its positions and stop-losses are never
            mixed with anyone else&apos;s. Only the owner can sign Mandates, use the Kill Switch and withdraw. You may own several Vaults.
          </p>
        ),
      },
      {
        id: "fields",
        title: "The Mandate, field by field",
        body: (
          <div className="rounded-2xl border border-line bg-cream-raised p-5 shadow-card md:p-7">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <p className="label-mono text-xs text-violet">Mandate · version 1</p>
              <Icon name="mandate" className="size-5 text-violet" />
            </div>
            <dl>
              {MANDATE_FIELDS.map((f) => (
                <div key={f.k} className="border-b border-dashed border-line py-2.5">
                  <div className="flex items-baseline gap-2 font-mono text-[13px]">
                    <dt className="text-ink">{f.k}</dt>
                    <span aria-hidden="true" className="min-w-4 flex-1 border-b border-dotted border-ink-faint/60" />
                    <dd className="text-violet">{f.v}</dd>
                  </div>
                  <p className="mt-0.5 text-[14px] leading-snug text-ink-soft">{f.note}</p>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex items-end justify-between gap-4">
              <p className="text-[12px] text-ink-faint">Example values. You choose your own.</p>
              <p className="border-t border-ink/40 px-6 pt-1 font-serif text-[15px] italic text-ink-soft">signed by your wallet</p>
            </div>
          </div>
        ),
      },
      {
        id: "versions",
        title: "Mandate Versions",
        body: (
          <p>
            Each signed revision is a Mandate Version. A tighter version takes effect immediately. A looser one waits until the Vault is{" "}
            <strong>Flat</strong>, meaning it has no open positions.
          </p>
        ),
      },
      {
        id: "drafting",
        title: "The model only drafts",
        body: (
          <p>
            In <Link href="/mandate">Chat</Link>, a language model turns your words into a draft. Nothing reaches the signature step unless it
            passes the engine&apos;s own checks, and you see exactly what you will sign.
          </p>
        ),
      },
    ],
  },
  {
    slug: "agents",
    group: "Concepts",
    nav: "Agents",
    icon: "chart",
    title: "Agents",
    description: "Who proposes trades, who leads your Vault and who decides which agent that is.",
    sections: [
      {
        id: "roles",
        title: "The four roles",
        body: (
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel label="proposes" title="Specialist Agent">A strategy agent that proposes trades. Three run today: momentum, funding-arb and mean-reversion. It needs a Bond to lead a Vault.</Panel>
            <Panel label="trades" title="Lead Agent">The one Specialist Agent trading your Vault right now. Every position has exactly one agent responsible for it.</Panel>
            <Panel label="assigns" title="Allocator">Picks each Vault&apos;s Lead Agent from the market Regime, Bond size and track record. A switch waits until the Vault is Flat.</Panel>
            <Panel label="bonds" title="Builder">Whoever registers and bonds a Specialist Agent. A Builder never holds a Vault&apos;s trading key.</Panel>
          </div>
        ),
      },
      {
        id: "rules",
        title: "Rules decide, the model explains",
        body: (
          <p>
            The first-party agents trade on fixed rules, such as momentum breakouts and funding thresholds. A language model only writes the
            plain-English rationale you read. That keeps replays exact, and a model&apos;s answer can never cause a Bond to be slashed.
          </p>
        ),
      },
      {
        id: "regimes",
        title: "Regimes",
        body: (
          <p>
            The Allocator classifies the market as trend, chop, high-volatility or funding-skew. Each Specialist Agent declares which
            Regimes it may lead in, and only agents that match the current one and meet their Bond Minimum are eligible.
          </p>
        ),
      },
    ],
  },
  {
    slug: "trade-lifecycle",
    group: "Concepts",
    nav: "Life of a trade",
    icon: "timer",
    title: "Life of a trade",
    description: "Six stops between an agent's idea and an order on Hyperliquid, and the three ways a trade leaves early.",
    sections: [
      {
        id: "pipeline",
        title: "The pipeline",
        body: (
          <Steps
            items={[
              { title: "Trade Proposal", body: "The Lead Agent proposes a trade, with its confidence and rationale." },
              { title: "Mandate Check", body: "The Execution Engine checks it against your current Mandate Version.", exit: "Fails: rejected and logged" },
              { title: "Veto Window", body: "Above your veto threshold, the trade waits 60 seconds. Trades that reduce or close a position never wait.", exit: "You veto: cancelled" },
              { title: "Second check", body: "When the window ends, the trade is checked again at the current price.", exit: "Price moved over 1%: dropped" },
              { title: "Decision Commitment", body: "A hash of the full decision is written onchain, before the order is sent." },
              { title: "Order and stop-loss", body: "The engine signs with the Vault's Agent Wallet and places the stop-loss with the order. That key can trade but can't withdraw." },
            ]}
          />
        ),
      },
      {
        id: "after",
        title: "After the order",
        body: (
          <p>
            The stop-loss rests on Hyperliquid for as long as the position is open. Every step above is kept in the decision record, which you
            can open in <Link href="/replay">Replay</Link>.
          </p>
        ),
      },
    ],
  },
  {
    slug: "protection",
    group: "Concepts",
    nav: "Stop-loss protection",
    icon: "bond",
    title: "Stop-loss protection",
    description: "What happens when a stop-loss fills past its trigger price, and who pays for the difference.",
    sections: [
      {
        id: "overshoot",
        title: "Overshoot",
        body: (
          <div className="rounded-2xl border border-line p-5">
            <p className="font-mono text-[clamp(1rem,2.2vw,1.375rem)] text-ink">|fill − trigger| × size</p>
            <p className="mt-2 text-[15px] leading-snug text-ink-soft">
              The loss beyond what an exit exactly at the stop-loss trigger price would have cost. Fees and funding are not included.
            </p>
          </div>
        ),
      },
      {
        id: "order",
        title: "Who pays, in order",
        body: (
          <ol className="flex flex-col gap-2">
            {[
              { who: "The agent's Bond", body: "Slashed first, including when the cause was a market gap the agent didn't create.", cls: "bg-violet text-white" },
              { who: "The Protocol Reserve", body: "Pays instead of the Bond after an Infrastructure Failure: no stop-loss order was resting on Hyperliquid when the trigger was crossed.", cls: "bg-violet-line text-violet-ink md:ml-[6%]" },
              { who: "The Protection Fund", body: "A shared pool, funded by premiums, pays what is left: at most 10% of a Vault's value at the start of the Epoch, per Epoch, and pro-rata if it runs short.", cls: "bg-violet-soft text-violet-ink md:ml-[12%]" },
            ].map((s, i) => (
              <li key={s.who} className={`flex gap-4 rounded-2xl p-5 ${s.cls}`}>
                <span className="font-serif text-[2rem] leading-none opacity-70">{i + 1}</span>
                <div>
                  <p className="text-[1.0625rem] font-medium">{s.who}</p>
                  <p className="mt-1 text-[15px] leading-snug opacity-85">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        ),
      },
      {
        id: "limits",
        title: "Protected, never guaranteed",
        body: (
          <p>
            Losses up to the stop-loss are yours, and the Fund&apos;s cover has limits. <Link href="/payouts">Payouts</Link> lists every
            settlement with its evidence and shows the live Coverage Ratio: the Fund&apos;s balance against total open stop-loss exposure.
          </p>
        ),
      },
    ],
  },
  {
    slug: "controls",
    group: `Using ${PRODUCT_NAME}`,
    nav: "Your controls",
    icon: "power",
    title: "Your controls",
    description: "What you can stop, when, and what the protocol stops for you.",
    sections: [
      {
        id: "veto",
        title: "Veto Window",
        body: <p>A trade above your veto threshold waits 60 seconds. A banner counts down on every page, with a one-click Veto. You can also turn on browser alerts on <Link href="/funds">Deposit and withdraw</Link>.</p>,
      },
      {
        id: "kill",
        title: "Kill Switch",
        body: <p>One action closes every position, freezes the Lead Agent and unlocks withdrawal. The kill flag is recorded onchain as a new Mandate Version. Signing a later version without the flag unfreezes the Vault.</p>,
      },
      {
        id: "auto-kill",
        title: "Automatic Kill",
        body: <p>The protocol stops new positions when the Vault hits your drawdown cap, or when the oracle price strays from a reference price. Existing stop-losses keep running.</p>,
      },
      {
        id: "withdraw",
        title: "Withdraw",
        body: <p>Owner only, and only while the Vault is Flat. If positions are open, the withdraw card offers the Kill Switch first.</p>,
      },
    ],
  },
  {
    slug: "funds",
    group: `Using ${PRODUCT_NAME}`,
    nav: "Deposits and withdrawals",
    icon: "vault",
    title: "Deposits and withdrawals",
    description: "Moving testnet USDC into your Vault and back out, and what each step costs.",
    sections: [
      {
        id: "deposit",
        title: "Deposit",
        body: (
          <>
            <p>
              Send USDC from Base Sepolia or Solana devnet on <Link href="/funds">Deposit and withdraw</Link>. It crosses with Circle&apos;s
              CCTP, lands in the protocol&apos;s Deposit Account and is forwarded to your Vault on Hyperliquid.
            </p>
            <FeeRow label="First deposit, once (Hyperliquid account activation)" value="1 USDC" />
          </>
        ),
      },
      {
        id: "withdraw",
        title: "Withdraw",
        body: (
          <>
            <p>Back to Base Sepolia or Solana devnet, while the Vault is Flat. The page shows each step as it completes, with a link to every transaction.</p>
            <FeeRow label="Hyperliquid transfer fee" value="~0.025 USDC" />
            <FeeRow label="Kept back in the Vault so the transfer isn't dropped" value="0.05 USDC" />
          </>
        ),
      },
      {
        id: "faucet",
        title: "Getting testnet USDC",
        body: (
          <p>
            Use <a href="https://faucet.circle.com" {...EXT}>faucet.circle.com</a> and pick Base Sepolia or Solana Devnet.
          </p>
        ),
      },
    ],
  },
  {
    slug: "verify",
    group: `Using ${PRODUCT_NAME}`,
    nav: "Verify it yourself",
    icon: "replay",
    title: "Verify it yourself",
    description: "You don't have to trust the dashboard. Every decision can be checked against the chain.",
    sections: [
      {
        id: "replay",
        title: "Replay a decision",
        body: (
          <p>
            <Link href="/replay">Replay</Link> shows a decision&apos;s inputs, rationale, Trade Proposal, Mandate Check, commitment, order, fill
            and outcome. Its hash is recomputed in your browser and checked against the onchain DecisionLog. A record that was changed
            afterwards shows a mismatch.
          </p>
        ),
      },
      {
        id: "contracts",
        title: "Read the contracts",
        body: (
          <p>
            Addresses for each network are in <a href={`${REPO}/tree/main/contracts/deployments`} {...EXT}>contracts/deployments</a>. The code is
            open source on <a href={REPO} {...EXT}>GitHub</a>.
          </p>
        ),
      },
      {
        id: "reasoning",
        title: "Read the reasoning",
        body: (
          <p>
            The reasons behind the design are written down as <a href={`${REPO}/tree/main/docs/adr`} {...EXT}>decision records</a>.
          </p>
        ),
      },
    ],
  },
  {
    slug: "builders",
    group: "Builders",
    nav: "Bring an agent",
    icon: "bond",
    title: "Bring an agent",
    description: "Register a Specialist Agent, post its Bond and compete to lead Vaults.",
    sections: [
      {
        id: "numbers",
        title: "The numbers",
        body: (
          <Cards>
            {[
              { n: "5%", label: "Bond Minimum", body: "Of the combined value of the Vaults your agent leads. Below it, the agent may only reduce or close positions." },
              { n: "3 days", label: "Unbonding", body: "The delay before a Bond can be withdrawn. It can start only while the agent leads no Vault." },
              { n: "24h", label: "Epoch", body: "The settlement period for fees, premiums, Protection Fund caps and Lead Agent switches." },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-line p-5">
                <p className="font-serif text-[2.5rem] leading-none text-violet">{s.n}</p>
                <p className="mt-3 text-[1.0625rem] font-medium text-ink">{s.label}</p>
                <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{s.body}</p>
              </div>
            ))}
          </Cards>
        ),
      },
      {
        id: "register",
        title: "Register and bond",
        body: (
          <p>
            Do both on <Link href="/builders">Bring an agent</Link>. Your agent only proposes: the Execution Engine checks every Trade
            Proposal against the Mandate, whatever produced it.
          </p>
        ),
      },
      {
        id: "ranking",
        title: "How agents are ranked",
        body: (
          <p>
            The <Link href="/leaderboard">Leaderboard</Link> ranks agents by risk-adjusted return, with real fills, Bond size and Vaults led.
            Fees apply only to gains above a Vault&apos;s High-Water Mark, its highest value so far.
          </p>
        ),
      },
    ],
  },
  {
    slug: "glossary",
    group: "Reference",
    nav: "Glossary",
    icon: "mandate",
    title: "Glossary",
    description: "The exact meaning of every capitalised term in these docs.",
    sections: [
      {
        id: "terms",
        title: "Terms",
        body: (
          <dl className="rounded-2xl border border-line">
            {GLOSSARY.map(([term, body]) => (
              <div key={term} className="grid gap-1 border-b border-line px-5 py-3.5 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
                <dt className="font-medium text-ink">{term}</dt>
                <dd className="text-[15px] leading-snug text-ink-soft">{body}</dd>
              </div>
            ))}
          </dl>
        ),
      },
    ],
  },
];

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline justify-between gap-4 rounded-xl border border-line px-4 py-3 font-mono text-[13px]">
      <span className="text-ink-soft">{label}</span>
      <span className="shrink-0 text-violet">{value}</span>
    </p>
  );
}
