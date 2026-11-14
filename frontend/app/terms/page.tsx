import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { Bullets, LegalPage, type LegalSection } from "../legal/legal-page";

export const metadata: Metadata = routeMetadata("/terms");

const sections: LegalSection[] = [
  {
    id: "what-it-is",
    title: "What Sapien is",
    body: (
      <>
        <p>
          {PRODUCT_NAME} is open-source software. Bonded AI agents trade perpetual futures on Hyperliquid for users&apos; Vaults,
          within a Mandate each user writes and signs. These terms cover the website, the smart contracts it talks to, and the
          Execution Engine the team runs.
        </p>
        <p>By connecting a wallet or using any part of {PRODUCT_NAME}, you agree to these terms. If you don&apos;t agree, don&apos;t use it.</p>
      </>
    ),
  },
  {
    id: "testnet",
    title: "Testnet only",
    body: (
      <>
        <p>
          {PRODUCT_NAME} runs on test networks: Hyperliquid testnet, HyperEVM testnet and NEAR testnet. Test tokens,
          including testnet USDC, have no monetary value and can&apos;t be redeemed for money.
        </p>
        <p>
          Test networks can be reset, paused or changed without notice. Vault balances, Bonds, positions and history may be lost
          when that happens. Don&apos;t send real funds to any {PRODUCT_NAME} address.
        </p>
      </>
    ),
  },
  {
    id: "wallet",
    title: "Your wallet and your Vault",
    body: (
      <>
        <p>You keep control of your wallet. {PRODUCT_NAME} never asks for, sees or stores your wallet&apos;s private key or seed phrase.</p>
        <Bullets
          items={[
            "Each Vault is its own smart contract. Only its owner can sign Mandate Versions, use the Kill Switch and withdraw.",
            "Each Vault's Agent Wallet is a trade-only key held by the Execution Engine. It can place and cancel orders, but it can't withdraw funds.",
            "Withdrawal is possible only while the Vault is Flat (no open positions). The Kill Switch closes every position so that you can withdraw.",
            "You are responsible for your wallet, the transactions you sign and the network fees you pay.",
          ]}
        />
      </>
    ),
  },
  {
    id: "mandates",
    title: "Mandates",
    body: (
      <>
        <p>
          You can describe your risk rules in plain English, and an AI model drafts a structured Mandate from them. The draft can
          be wrong. You must check and confirm every field before you sign.
        </p>
        <p>
          The Mandate Version you sign is the only one the Execution Engine enforces. Tighter versions take effect immediately.
          Looser ones take effect once your Vault is Flat.
        </p>
      </>
    ),
  },
  {
    id: "agents",
    title: "Agents, Builders and Bonds",
    body: (
      <>
        <p>
          A Builder registers a Specialist Agent and stakes a USDC Bond for it. By staking a Bond, a Builder agrees that it is
          slashed first for all Overshoot on the agent&apos;s positions, including Overshoot from market gaps, under the protocol&apos;s
          fixed rules. Slashing is not decided case by case, and there is no dispute process.
        </p>
        <Bullets
          items={[
            "An agent below its Bond Minimum (5% of the combined value of the Vaults it leads) may only reduce or close positions, and is not assigned new Vaults.",
            "Unbonding can start only while the agent leads no Vault. It takes 3 days, and the Bond can still be slashed until it is withdrawn.",
            "Builders never hold a Vault's trading key. An agent sends Trade Proposals, and only those that pass the Mandate Check are executed.",
          ]}
        />
      </>
    ),
  },
  {
    id: "protection",
    title: "Stop-loss protection is not a guarantee",
    body: (
      <>
        <p>
          Every position carries a stop-loss. Losses beyond the stop-loss price (Overshoot) are covered first by the Lead
          Agent&apos;s Bond and then by the Protection Fund. Overshoot from an Infrastructure Failure is covered by the Protocol
          Reserve instead. This is stop-loss protection, not a guarantee:
        </p>
        <Bullets
          items={[
            "The Protection Fund pays each Vault at most 10% of its value at the start of the Epoch, per Epoch, and pays pro-rata if it is short.",
            "Losses up to your stop-loss price are yours and are not covered.",
            "Fees and funding are not counted as Overshoot.",
          ]}
        />
        <p>
          See the <Link href="/risk" className="text-violet underline">Risk Disclosure</Link> for the full list of risks.
        </p>
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    body: (
      <p>
        At each Epoch settlement, fees are taken only from profit above your Vault&apos;s High-Water Mark: 12% to the agent&apos;s
        Builder and 3% to the protocol, plus a 3% profit premium to the Protection Fund. Base premiums for stop-loss protection
        are charged to every Vault. Rates are shown in the app and can change between Epochs.
      </p>
    ),
  },
  {
    id: "no-advice",
    title: "No investment advice",
    body: (
      <p>
        Nothing in {PRODUCT_NAME} is investment, financial, legal or tax advice. Agent rationales, Regime readings and leaderboard
        figures describe what the software did. They are not recommendations, and past results don&apos;t predict future ones.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <Bullets
          items={[
            "use Sapien where it is against the law where you live, or to break sanctions;",
            "attack, overload or try to break the website, the Execution Engine or the contracts, except through responsible disclosure;",
            "manipulate markets, or register agents to game the Allocator or the leaderboard;",
            "pretend to be another user or Builder.",
          ]}
        />
      </>
    ),
  },
  {
    id: "as-is",
    title: "Open source, provided as is",
    body: (
      <p>
        {PRODUCT_NAME} is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or implied. That
        includes merchantability, fitness for a particular purpose and non-infringement. The smart contracts have not been
        audited. The source code is public, and your use of it is also governed by its open-source license.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the fullest extent the law allows, the {PRODUCT_NAME} team and contributors are not liable for any indirect,
        incidental, special or consequential losses, or for any loss of funds, data or profits, that arise from using or being
        unable to use {PRODUCT_NAME}. This applies even if we were told such a loss was possible.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. The date at the top of this page shows the latest version, and changes are visible in the
        project&apos;s public history. If you keep using {PRODUCT_NAME} after a change, you accept the new terms.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="/terms"
      eyebrow="Legal"
      title="Terms of Use"
      intro={<p>The rules for using {PRODUCT_NAME} on testnet: what we do, what you&apos;re responsible for, and what isn&apos;t promised.</p>}
      sections={sections}
    />
  );
}
