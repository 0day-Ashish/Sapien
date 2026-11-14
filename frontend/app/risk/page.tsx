import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { PRODUCT_NAME } from "@/lib/brand";
import { Bullets, LegalPage, type LegalSection } from "../legal/legal-page";
import { OnNear } from "./near-panel";

export const metadata: Metadata = routeMetadata("/risk");

const sections: LegalSection[] = [
  {
    id: "perps",
    title: "Perpetual futures and leverage",
    body: (
      <>
        <p>
          Vaults trade perpetual futures with leverage, up to the cap in your Mandate. Leverage multiplies gains and losses alike.
          Prices can move fast, and funding payments can add to a loss over time.
        </p>
        <p>A position can lose up to its stop-loss distance before any protection applies. That loss is yours.</p>
      </>
    ),
  },
  {
    id: "overshoot",
    title: "Stop-losses can fill worse than their trigger",
    body: (
      <>
        <p>
          A stop-loss becomes a market order when its trigger price is crossed. In a fast or thin market, or across a price gap,
          it can fill well beyond the trigger. The extra loss is called Overshoot.
        </p>
        <Bullets
          items={[
            "The Lead Agent's Bond pays Overshoot first, then the Protection Fund pays.",
            "The Protection Fund pays each Vault at most 10% of its value at the start of the Epoch, per Epoch, and pays pro-rata if it is short. Large Overshoot can exceed both.",
            "Overshoot from an Infrastructure Failure (no resting stop-loss when the trigger was crossed) is paid by the Protocol Reserve, which is also limited.",
            "Payouts are final. Nothing is clawed back, and nothing beyond these sources is owed.",
          ]}
        />
        <p className="font-medium text-ink">{PRODUCT_NAME} is stop-loss protected, never guaranteed.</p>
      </>
    ),
  },
  {
    id: "agents",
    title: "Agent and strategy risk",
    body: (
      <Bullets
        items={[
          "Specialist Agents follow fixed rules that can lose money, sometimes for long stretches.",
          "The Allocator can misread the market Regime and pick an agent that doesn't fit it.",
          "A Lead Agent switch waits until your Vault is Flat. Until then, the outgoing agent can still reduce or close positions.",
          "Track records and leaderboard figures come from testnet and don't predict future results.",
        ]}
      />
    ),
  },
  {
    id: "ai",
    title: "AI-drafted Mandates and rationales",
    body: (
      <p>
        AI drafts your Mandate from plain English, and AI writes the agents&apos; rationales. Either can be wrong or misleading. Only
        the fields you confirm and sign are enforced, so check every one. Trading decisions are made by rules, not by the AI.
      </p>
    ),
  },
  {
    id: "controls",
    title: "Controls that may not act in time",
    body: (
      <Bullets
        items={[
          "The Veto Window gives you 60 seconds to stop a large trade. If you miss it, the trade can go ahead after a fresh Mandate Check.",
          "An Automatic Kill stops new positions at your drawdown cap or when the oracle price strays from a reference price. It doesn't close the positions you already have.",
          "The Kill Switch closes positions with market orders, which can fill at poor prices.",
          "Every control depends on the Execution Engine running. Outages can delay them.",
        ]}
      />
    ),
  },
  {
    id: "contracts",
    title: "Smart contract and infrastructure risk",
    body: (
      <Bullets
        items={[
          "The smart contracts are unaudited and may contain bugs that lose or lock funds.",
          "The Execution Engine holds each Vault's trade-only Agent Wallet. A compromised engine can't withdraw funds, but it could place bad trades.",
          "Hyperliquid, HyperEVM and their RPC endpoints can halt, lag or misbehave.",
          "Oracle and mark prices can be wrong or delayed.",
        ]}
      />
    ),
  },
  {
    id: "bridges",
    title: "Deposit and withdrawal risk",
    body: (
      <p>
        Deposits go from your NEAR wallet to the Sapien NEAR contract, and the Execution Engine forwards them to your Vault.
        Withdrawals are paid by the engine from the contract once your Vault is Flat. Either step can be delayed if the engine
        or an RPC endpoint is down, and a withdrawal waits while positions are open. NEAR Intents quotes on the deposit card are
        a mainnet-route illustration and don&apos;t move testnet funds.
      </p>
    ),
  },
  {
    id: "near",
    title: "On NEAR",
    body: <OnNear />,
  },
  {
    id: "testnet",
    title: "Testnet and regulatory risk",
    body: (
      <p>
        {PRODUCT_NAME} runs on test networks that can be reset without notice, erasing balances and history. Rules for crypto,
        derivatives and automated trading vary by country and change often. A mainnet version, if there ever is one, may not be
        available where you live.
      </p>
    ),
  },
];

export default function RiskPage() {
  return (
    <LegalPage
      current="/risk"
      eyebrow="Legal"
      title="Risk Disclosure"
      intro={<p>Trading perps with AI agents can lose money. This page sets out how, and what stop-loss protection does and doesn&apos;t cover.</p>}
      sections={sections}
    />
  );
}
