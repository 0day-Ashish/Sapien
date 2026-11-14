import { DEMO_FUNDS } from "@/lib/demo/sidebar-demo";
import { DemoBanner } from "../ui/demo-banner";

// Read-only previews for the Mandate app's wallet views, shown until a wallet is connected. Every number is sample data.

const usdc = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;

function Step({ label, state, detail }: { label: string; state: "done" | "active" | "pending"; detail?: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className={`chip ${state === "done" ? "chip-forest" : state === "active" ? "chip-amber" : ""}`}>
        {state === "done" ? "Done" : state === "active" ? "Waiting" : "Next"}
      </span>
      <span className={state === "pending" ? "text-ink-faint" : ""}>{label}</span>
      {detail && <span className="font-mono text-xs text-ink-soft">{detail}</span>}
    </li>
  );
}

const Disabled = ({ children, primary }: { children: string; primary?: boolean }) => (
  <button type="button" disabled className={`btn ${primary ? "btn-primary" : "btn-secondary"} cursor-not-allowed opacity-50`}>
    {children}
  </button>
);

export function FundsDemo() {
  const f = DEMO_FUNDS;
  return (
    <div className="flex flex-col gap-6">
      <DemoBanner>A preview with sample numbers. Connect your Meteor Wallet (bottom of the sidebar) to see your own Vault, deposit and withdraw.</DemoBanner>
      <section className="card flex flex-col gap-2 p-6 text-sm">
        <p className="label-mono">Your Vault</p>
        <p className="font-mono break-all text-ink-soft">{f.vault}</p>
        <p>
          Balance on HyperCore: <strong>{usdc(f.balanceUsdc)}</strong> · <span className="chip chip-forest">Flat</span>
        </p>
      </section>
      <section className="card flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="display-3">Deposit</h2>
          <p className="text-sm text-ink-soft">Test USDC on NEAR testnet, through the Sapien NEAR contract, into your Vault on HyperCore.</p>
        </div>
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-ink-soft">Amount</dt>
          <dd className="font-mono">{usdc(f.deposit.amountUsdc)}</dd>
          <dt className="text-ink-soft">Network fee</dt>
          <dd className="font-mono">{usdc(f.deposit.feeUsdc)}</dd>
          <dt className="text-ink-soft">Arrives in your Vault</dt>
          <dd className="font-mono">≈ {usdc(f.deposit.amountUsdc - f.deposit.feeUsdc)}</dd>
        </dl>
        <div>
          <Disabled primary>Deposit</Disabled>
        </div>
        <ol className="flex flex-col gap-2">
          <Step label="Sent to the NEAR contract" state="done" detail="7c1eA94f…" />
          <Step label="Seen by the engine" state="done" />
          <Step label="In your Vault" state="active" detail="waiting for the engine to forward it" />
        </ol>
      </section>
      <section className="card flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="display-3">Withdraw</h2>
          <p className="text-sm text-ink-soft">
            From a Flat Vault to your NEAR account. With open positions, the Kill Switch closes them first.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Disabled primary>Withdraw</Disabled>
          <Disabled>Kill Switch</Disabled>
        </div>
      </section>
    </div>
  );
}
