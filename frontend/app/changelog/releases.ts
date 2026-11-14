// Every release, newest first: the /changelog page and its Markdown copy (/changelog.md) both read this.

export type Item = { title?: string; body: string };
export type Release = {
  version: string;
  date: string;
  summary: string;
  added: Item[];
  improved: Item[];
  fixed: Item[];
  learnMore: { href: string; label: string }[];
};

// Newest first. Each release groups the pull requests that merged in one stretch of 14 November 2026 (times in UTC).
export const RELEASES: Release[] = [
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
