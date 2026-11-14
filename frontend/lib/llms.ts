import { DOC_PAGES, docHref } from "@/app/docs/content";
import { docMarkdown } from "@/app/docs/markdown";
import { AGENT_REGISTRY } from "./agents/bonds";
import { PRODUCT_NAME } from "./brand";
import { DECISION_LOG } from "./engine/replay";
import { NEAR_CONTRACT, NEAR_EXPLORER, NEAR_USDC } from "./near/config";
import { FEE_ROUTER } from "./settlement/epoch";
import { PROTECTION_FUND } from "./settlement/payouts";
import { SITE_DESCRIPTION, SITE_ROUTES, SITE_URL, absoluteUrl } from "./site";
import { VAULT_FACTORY } from "./vault/funds";

// /llms.txt (https://llmstxt.org): a short Markdown index of the site for language models and agents.
// /llms-full.txt: the same header followed by every docs page in full.

const REPO = "https://github.com/SachPlayZ/Sapien";

/** The engine's public base URL, or the production engine when the env points at localhost. */
function engineUrl() {
  const env = process.env.NEXT_PUBLIC_ENGINE_URL;
  return env && !/127\.0\.0\.1|localhost/.test(env) ? env.replace(/\/$/, "") : "https://sapien.152-67-0-76.sslip.io";
}

const link = (title: string, url: string, note: string) => `- [${title}](${url}): ${note}`;

function header(): string[] {
  return [
    `# ${PRODUCT_NAME}`,
    `> ${SITE_DESCRIPTION}`,
    [
      "Key facts:",
      "- Everything runs on test networks: NEAR testnet, Hyperliquid testnet and HyperEVM testnet. Test tokens have no monetary value.",
      "- A **Vault** is one user's isolated trading capital: a HyperEVM contract with its own Hyperliquid account.",
      "- A **Mandate** is the policy the user signs: allowed assets, leverage cap, stop-loss %, drawdown cap, blackout windows and veto threshold. The engine refuses any trade that doesn't fit it.",
      "- **Specialist Agents** (momentum, funding-arb, mean-reversion) propose trades; the Allocator picks one **Lead Agent** per Vault each Epoch (24h).",
      "- Every Builder posts a **Bond**. When a stop-loss fills past its trigger (**Overshoot**), the Bond pays first, then the Protection Fund.",
      "- Fees apply only to profit above the High-Water Mark: 12% to the Builder, 3% to the protocol, 3% to the Protection Fund.",
      "- The user's NEAR account (Meteor Wallet) holds the controls: deposits, withdrawal requests, the Mandate hash and the Kill Switch.",
      "- Before any order is sent, a hash of the decision is committed onchain (Decision Commitment), so anyone can check it later on /replay.",
    ].join("\n"),
    "Actions that move money or change a Vault (deposit, withdraw, sign a Mandate, Kill Switch, post a Bond) need the user's own wallet. An agent can read everything below, but should hand those steps to the user.",
  ];
}

function index(): string[] {
  const sections = ["Product", "App", "Transparency", "Legal"] as const;
  const out: string[] = [];
  out.push(
    "## Docs",
    DOC_PAGES.map((p) => link(p.nav, absoluteUrl(`${docHref(p.slug)}.md`), p.description)).join("\n"),
  );
  for (const s of sections) {
    const rows = SITE_ROUTES.filter((r) => r.section === s);
    out.push(
      `## ${s === "App" ? "App (needs a wallet)" : s}`,
      rows.map((r) => link(r.title, absoluteUrl(r.path), r.description)).join("\n"),
    );
  }
  const engine = engineUrl();
  out.push(
    "## Read-only APIs",
    [
      link("Decision feed", `${engine}/feed?limit=50`, "the latest agent decisions, newest first; filter with `vault=0x…`."),
      link("Executed decisions", `${engine}/decisions?limit=200`, "executed decisions with their Decision Commitment hash; `hash=0x…` returns one."),
      link("Leaderboard", `${engine}/leaderboard`, "Specialist Agents with Bond, risk-adjusted return and Vaults led."),
      link("Vault status", `${engine}/vaults/{vault}/status`, "a Vault's Lead Agent and any Automatic Kill."),
      link("NEAR Intents quote", `${SITE_URL}/api/intents/quote?amount=5`, "a live 1Click quote, NEAR USDC → HyperCore USDC (`dry: true`, nothing is moved)."),
    ].join("\n"),
    "## Onchain",
    [
      link(`NEAR contract ${NEAR_CONTRACT}`, `${NEAR_EXPLORER}/address/${NEAR_CONTRACT}`, "Vault records, deposits, withdrawals, Mandate hashes, Kill Switch, Decision Commitments, agent payouts. Views: `vault_of(account)`, `deposit(id)`, `withdrawal(id)`, `decision(id)`, `agents()`, `config()`."),
      link(`Test USDC ${NEAR_USDC}`, `${NEAR_EXPLORER}/address/${NEAR_USDC}`, "NEP-141, 6 decimals, open `faucet`."),
      `- HyperEVM testnet (chain 998, RPC https://rpc.hyperliquid-testnet.xyz/evm): VaultFactory \`${VAULT_FACTORY}\`, DecisionLog \`${DECISION_LOG}\`, AgentRegistry \`${AGENT_REGISTRY}\`, ProtectionFund \`${PROTECTION_FUND}\`, FeeRouter \`${FEE_ROUTER}\`.`,
    ].join("\n"),
    "## Optional",
    [
      link("Full docs in one file", `${SITE_URL}/llms-full.txt`, "every docs page as Markdown."),
      link("Source code", REPO, "contracts, NEAR contract, engine and this site (MIT)."),
      link("Sitemap", `${SITE_URL}/sitemap.xml`, "every public URL."),
    ].join("\n"),
  );
  return out;
}

export const llmsTxt = () => [...header(), ...index()].join("\n\n") + "\n";

export const llmsFullTxt = () =>
  [...header(), `Index: ${SITE_URL}/llms.txt`, ...DOC_PAGES.map((p) => docMarkdown(p).replace(/^# /, "# Docs: ").trim())].join("\n\n") + "\n";

export const textResponse = (body: string) =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
