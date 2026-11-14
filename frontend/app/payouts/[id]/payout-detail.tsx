"use client";

import { useEffect, useState } from "react";
import { isHex, keccak256, toHex, type Hex } from "viem";
import { PROTECTION_FUND, formatE8, parseEvidence, payoutSources, protectionFundAbi, type Settlement } from "@/lib/settlement/payouts";
import { formatUsdc } from "@/lib/vault/funds";
import { hyperClient } from "@/lib/hyperevm";

const BAR: Record<string, string> = { reserve: "bg-blue", bond: "bg-orange", fund: "bg-green", unpaid: "bg-line" };

/** One settled claim: what the Overshoot was, who paid it, and the evidence it was judged on. */
export function PayoutDetail({ id }: { id: string }) {
  const [s, setS] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!PROTECTION_FUND || !isHex(id) || id.length !== 66) return;
    hyperClient.readContract({ address: PROTECTION_FUND, abi: protectionFundAbi, functionName: "settlement", args: [id as Hex] })
      .then(setS, (e) => setError((e as Error).message));
  }, [id]);

  if (!PROTECTION_FUND) return <p className="text-sm text-ink-soft">The ProtectionFund isn&apos;t configured on this deployment.</p>;
  if (!isHex(id) || id.length !== 66) return <p role="alert" className="text-sm text-orange">Not a payout id.</p>;
  if (error) return <p role="alert" className="text-sm text-orange">{error}</p>;
  if (!s) return <p className="text-sm text-ink-soft">Reading the payout…</p>;
  if (s.overshoot === BigInt(0)) return <p className="text-sm text-ink-soft">No payout with this id.</p>;

  const sources = payoutSources(s);
  const evidence = parseEvidence(s.evidenceRef);
  const evidenceMatches = keccak256(toHex(s.evidenceRef)) === s.evidenceHash;
  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-3 p-6 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${s.infrastructureFailure ? "chip-clay" : "chip-amber"}`}>
            {s.infrastructureFailure ? "Infrastructure Failure" : "Market gap"}
          </span>
          <span className="font-mono text-xs text-ink-soft">Epoch {String(s.epoch)} · {new Date(Number(s.settledAt) * 1000).toLocaleString()}</span>
        </div>
        <p>
          Vault <span className="font-mono break-all">{s.vault}</span>, Lead Agent <strong>{s.agentId}</strong>
        </p>
        <dl className="grid grid-cols-2 gap-1">
          <dt className="text-ink-soft">Stop-loss trigger</dt>
          <dd className="font-mono">{formatE8(s.triggerPriceE8)}</dd>
          <dt className="text-ink-soft">Filled at</dt>
          <dd className="font-mono">{formatE8(s.fillPriceE8)}</dd>
          <dt className="text-ink-soft">Size</dt>
          <dd className="font-mono">{formatE8(s.sizeE8)}</dd>
          <dt className="text-ink-soft">Overshoot (|fill − trigger| × size)</dt>
          <dd className="font-mono">{formatUsdc(s.overshoot)}</dd>
        </dl>
      </section>

      <section className="card flex flex-col gap-3 p-6 text-sm">
        <h2 className="display-3">Who paid</h2>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-cream-sunk" aria-hidden>
          {sources.map((r) => (
            <span key={r.key} className={BAR[r.key]} style={{ width: `${r.share * 100}%` }} />
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-1">
          {sources.map((r) => (
            <div key={r.key} className="contents">
              <dt className="text-ink-soft">{r.label}</dt>
              <dd className="font-mono">
                {formatUsdc(r.amount)} · {(r.share * 100).toFixed(1)}%
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-soft">
          Paid to the Vault on HyperEVM, where its owner can withdraw it. Nothing is clawed back.
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-6 text-sm">
        <h2 className="display-3">Evidence</h2>
        <p className="text-xs">
          {evidenceMatches ? (
            <span className="chip chip-forest">Matches the onchain hash</span>
          ) : (
            <span className="chip chip-clay">Doesn&apos;t match the onchain hash</span>
          )}
        </p>
        {evidence ? (
          <dl className="grid grid-cols-2 gap-1">
            <dt className="text-ink-soft">Stop-loss order</dt>
            <dd className="font-mono break-all">{evidence.stop.cloid}</dd>
            <dt className="text-ink-soft">Placed on HyperCore</dt>
            <dd className="font-mono">{new Date(evidence.stop.placedAt).toLocaleString()}</dd>
            <dt className="text-ink-soft">Its state on HyperCore</dt>
            <dd className="font-mono">{evidence.stop.stateOnHyperCore}</dd>
            <dt className="text-ink-soft">Closing fill</dt>
            <dd className="font-mono break-all">
              {evidence.fill.orderId} at {evidence.fill.price}, {new Date(evidence.fill.at).toLocaleString()}
            </dd>
            <dt className="text-ink-soft">Asset, side</dt>
            <dd className="font-mono">
              {evidence.stop.asset}, {evidence.stop.side}
            </dd>
          </dl>
        ) : (
          <pre className="overflow-x-auto rounded-md bg-cream-sunk p-3 font-mono text-xs">{s.evidenceRef}</pre>
        )}
      </section>
    </div>
  );
}
