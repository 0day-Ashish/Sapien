import { DEMO_BOND, DEMO_FUNDS } from "@/lib/demo/sidebar-demo";
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
      <DemoBanner>A preview with sample numbers. Connect your wallet (bottom of the sidebar) to see your own Vault, deposit and withdraw.</DemoBanner>
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
          <p className="text-sm text-ink-soft">USDC from Base Sepolia or Solana devnet, through CCTP, into your Vault on HyperCore.</p>
        </div>
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-ink-soft">Amount</dt>
          <dd className="font-mono">{usdc(f.deposit.amountUsdc)}</dd>
          <dt className="text-ink-soft">CCTP fee (at most)</dt>
          <dd className="font-mono">{usdc(f.deposit.feeUsdc)}</dd>
          <dt className="text-ink-soft">Arrives in your Vault</dt>
          <dd className="font-mono">≈ {usdc(f.deposit.amountUsdc - f.deposit.feeUsdc)}</dd>
        </dl>
        <div>
          <Disabled primary>Deposit</Disabled>
        </div>
        <ol className="flex flex-col gap-2">
          <Step label="Burned on Base Sepolia" state="done" detail="0x7c1e…a94f" />
          <Step label="Attested by Circle" state="done" />
          <Step label="In the Deposit Account" state="done" />
          <Step label="In your Vault" state="active" detail="waiting for the engine to forward it" />
        </ol>
      </section>
      <section className="card flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="display-3">Withdraw</h2>
          <p className="text-sm text-ink-soft">
            From a Flat Vault to your wallet on Base Sepolia or Solana devnet. With open positions, the Kill Switch closes them first.
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

export function BondsDemo() {
  const b = DEMO_BOND;
  return (
    <div className="flex flex-col gap-6">
      <DemoBanner>A preview with a sample agent. Connect your wallet (bottom of the sidebar) to register an agent and manage its Bond.</DemoBanner>
      <section className="card flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="display-3">Your agent&apos;s Bond</h2>
          <p className="text-sm text-ink-soft">
            Below the Bond Minimum (5% of the Vaults it leads), an agent may only reduce or close positions and gets no new Vaults.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-ink-soft">Agent</dt>
          <dd className="font-mono">{b.agentId}</dd>
          <dt className="text-ink-soft">Status</dt>
          <dd>
            <span className="chip chip-forest">Can lead Vaults</span>
          </dd>
          <dt className="text-ink-soft">Bond</dt>
          <dd className="font-mono">{usdc(b.bondUsdc)}</dd>
          <dt className="text-ink-soft">Bond Minimum</dt>
          <dd className="font-mono">{usdc(b.bondMinimumUsdc)}</dd>
          <dt className="text-ink-soft">Leads</dt>
          <dd className="font-mono">
            {b.ledVaults} Vaults · {usdc(b.ledValueUsdc)}
          </dd>
          <dt className="text-ink-soft">Regimes</dt>
          <dd>{b.regimes.join(", ")}</dd>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Disabled primary>Top up</Disabled>
          <Disabled>Start Unbonding</Disabled>
        </div>
        <p className="text-xs text-ink-faint">
          Unbonding can start only while the agent leads no Vault. It takes 3 days, and the Bond stays slashable until it is withdrawn.
        </p>
      </section>
      <section className="card flex flex-col gap-2 p-6 text-sm">
        <h2 className="display-3">Register an agent</h2>
        <p className="text-ink-soft">
          Pick an agent id and the Regimes it may lead in, then stake a USDC Bond. You never hold a Vault&apos;s trading key: your agent sends
          Trade Proposals, and the Execution Engine Mandate Checks them.
        </p>
        <div>
          <Disabled primary>Register and stake</Disabled>
        </div>
      </section>
    </div>
  );
}
