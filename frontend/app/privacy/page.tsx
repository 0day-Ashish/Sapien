import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { Bullets, LegalPage, type LegalSection } from "../legal/legal-page";

export const metadata: Metadata = { title: `Privacy Policy · ${PRODUCT_NAME}` };

const sections: LegalSection[] = [
  {
    id: "short-version",
    title: "The short version",
    body: (
      <Bullets
        items={[
          "There are no accounts, emails or passwords. You use Sapien by connecting a wallet.",
          "We don't use cookies, analytics or ad trackers.",
          "What your Vault does onchain is public and permanent, as on any blockchain.",
          "The rules you type to draft a Mandate are sent to an AI provider to produce the draft.",
        ]}
      />
    ),
  },
  {
    id: "what-we-process",
    title: "What we process",
    body: (
      <Bullets
        items={[
          <>
            <strong className="text-ink">Wallet addresses.</strong> Your address, your Vault&apos;s address and, for Builders, the
            agents you register. We use them to read balances and to send the transactions you sign.
          </>,
          <>
            <strong className="text-ink">Mandate text.</strong> The plain-English rules you type when you ask for a draft. It is
            sent to the model provider to produce the draft. The Mandate you sign is stored onchain.
          </>,
          <>
            <strong className="text-ink">Mandate chat history.</strong> Each draft you start, with the text you typed and the
            fields of the draft, is saved in our database so your Recent list survives a refresh. It is filed under a random key
            that only your browser holds, and it isn&apos;t linked to your wallet address. We keep your 20 most recent drafts, and
            deleting a draft from Recent removes it from the database.
          </>,
          <>
            <strong className="text-ink">Trading records.</strong> For each Vault, the Execution Engine keeps every decision: the
            Trade Proposal, its rationale, the Mandate Check result, the Decision Commitment, the order and the fill. These records
            power the agent&apos;s-eye view, replay and the leaderboard. They can be viewed by Vault address.
          </>,
          <>
            <strong className="text-ink">Server logs.</strong> Our hosting provider and RPC endpoints may log IP addresses and
            request metadata as part of normal operation.
          </>,
        ]}
      />
    ),
  },
  {
    id: "onchain",
    title: "Onchain data is public",
    body: (
      <p>
        Vault creation, Mandate Versions, Decision Commitments, Bonds, deposits and withdrawals are recorded on public blockchains
        (HyperEVM, HyperCore, Base Sepolia, Solana devnet). Anyone can read them, and no one, including us, can change or delete
        them.
      </p>
    ),
  },
  {
    id: "browser",
    title: "Stored in your browser",
    body: (
      <p>
        The Builder page remembers the last agent id you looked up in your browser&apos;s local storage, so the page can show it
        next time. The Mandate chat keeps a copy of your recent drafts there too, along with the random key your chat history is
        filed under. These stay on your device, and clearing your site data removes them. Without that key, the drafts saved
        in our database can no longer be opened. Your wallet extension keeps its own connection state.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "Services we rely on",
    body: (
      <>
        <p>Using {PRODUCT_NAME} involves these services, each under its own privacy policy:</p>
        <Bullets
          items={[
            "Google (Gemini) and Groq, which draft Mandates from the text you type;",
            "Neon, which hosts the database that holds Mandate chat history;",
            "Hyperliquid (HyperCore and HyperEVM), where Vaults trade and hold funds;",
            "Circle's CCTP, which moves USDC between chains;",
            "your wallet provider, and the public RPC endpoints your wallet and the app connect to;",
            "the hosting provider that serves this website.",
          ]}
        />
        <p>The AI models that write agent rationales and help the Allocator receive market data, not your personal data.</p>
      </>
    ),
  },
  {
    id: "no-selling",
    title: "No selling, no profiling",
    body: <p>We don&apos;t sell or rent your data. We don&apos;t build advertising profiles, and we don&apos;t share data except as described here or when the law requires it.</p>,
  },
  {
    id: "your-choices",
    title: "Your choices",
    body: (
      <Bullets
        items={[
          "You can disconnect your wallet from Sapien at any time, in the app or in your wallet.",
          "You don't have to draft with AI: you can fill in a Mandate by hand.",
          "You can ask us to remove off-chain trading records for your Vault. Onchain records can't be removed.",
        ]}
      />
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>{PRODUCT_NAME} is not meant for anyone under 18, and we don&apos;t knowingly process their data.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>We may update this policy. The date at the top of this page shows the latest version, and every change is visible in the project&apos;s public history.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="/privacy"
      eyebrow="Legal"
      title="Privacy Policy"
      intro={<p>What {PRODUCT_NAME} learns about you, where it goes, and what stays public by design.</p>}
      sections={sections}
    />
  );
}
