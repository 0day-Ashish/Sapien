"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { readContract } from "wagmi/actions";
import { FEE_ROUTER, type EpochReport, feeRouterAbi, formatRate, profitFees, riskTier } from "@/lib/settlement/epoch";
import { formatUsdc } from "@/lib/vault/funds";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";

/** The Vault's risk tier and premium rate, recalibrated each Epoch, and what its last Epoch settled. */
export function VaultRisk({ vault }: { vault: Address }) {
  const [report, setReport] = useState<EpochReport | null | undefined>(undefined);
  useEffect(() => {
    const read = () =>
      void readContract(wagmiConfig, { chainId: hyperEvmTestnet.id, address: FEE_ROUTER, abi: feeRouterAbi, functionName: "latest", args: [vault] })
        .then((r) => setReport(r.settledAt > BigInt(0) ? r : null))
        .catch(() => setReport(null));
    const first = setTimeout(read, 0);
    const t = setInterval(read, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [vault]);

  if (report === undefined) return null;
  if (report === null) {
    return (
      <section className="card flex flex-col gap-2 p-6 text-sm">
        <p className="label-mono">Risk tier and premium</p>
        <p className="text-ink-soft">Set at your Vault&apos;s first Epoch settlement (every 24h).</p>
      </section>
    );
  }
  const tier = riskTier(report.premiumRatePpm);
  return (
    <section className="card flex flex-col gap-4 p-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-mono">Risk tier and premium</p>
        <span className={`chip ${tier.chip}`}>{tier.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="label-mono text-ink-soft">Premium rate</span>
          <span className="display-3">{formatRate(report.premiumRatePpm)}</span>
          <span className="text-xs text-ink-soft">of traded notional, to the Protection Fund</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="label-mono text-ink-soft">High-Water Mark</span>
          <span className="font-mono">{formatUsdc(report.highWaterMark)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="label-mono text-ink-soft">Epoch {report.epoch.toString()}</span>
          <span className="font-mono">
            {report.profit > BigInt(0) ? `${formatUsdc(report.profit)} profit, ${formatUsdc(profitFees(report))} in fees` : "No profit above the mark"}
          </span>
          <span className="text-xs text-ink-soft">Base premium {formatUsdc(report.basePremium)}</span>
        </div>
      </div>
      <p className="text-xs text-ink-soft">
        The rate is recalibrated every Epoch from your Mandate&apos;s leverage cap and stop-loss and the market&apos;s volatility. Fees
        apply only to profit above the High-Water Mark: 12% to the Lead Agent&apos;s Builder, 3% to the protocol, 3% profit premium.
      </p>
    </section>
  );
}
