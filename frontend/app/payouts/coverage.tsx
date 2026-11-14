"use client";

import { useEffect, useState } from "react";
import { readContract } from "wagmi/actions";
import { PROTECTION_FUND, formatCoverage, protectionFundAbi } from "@/lib/settlement/payouts";
import { formatUsdc } from "@/lib/vault/funds";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";

type Fund = { coverage: bigint; fund: bigint; reserve: bigint; exposure: bigint };

/** The live Coverage Ratio (Protection Fund ÷ open stop-loss exposure), refreshed every 10s. */
export function CoverageRatio() {
  const [fund, setFund] = useState<Fund | null>(null);
  useEffect(() => {
    if (!PROTECTION_FUND) return;
    const read = { chainId: hyperEvmTestnet.id, address: PROTECTION_FUND, abi: protectionFundAbi } as const;
    const tick = () =>
      void Promise.all([
        readContract(wagmiConfig, { ...read, functionName: "coverageRatioBps" }),
        readContract(wagmiConfig, { ...read, functionName: "fundBalance" }),
        readContract(wagmiConfig, { ...read, functionName: "reserveBalance" }),
        readContract(wagmiConfig, { ...read, functionName: "openExposure" }),
      ])
        .then(([coverage, f, reserve, exposure]) => setFund({ coverage, fund: f, reserve, exposure }))
        .catch(() => {});
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  if (!PROTECTION_FUND) return <p className="text-sm text-ink-soft">The ProtectionFund isn&apos;t configured on this deployment.</p>;
  return (
    <section className="card-outline border-green text-green grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
      <div className="flex flex-col gap-1">
        <span className="label-mono">Coverage Ratio</span>
        <span className="display-3">{fund ? formatCoverage(fund.coverage) : "…"}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="label-mono">Protection Fund</span>
        <span className="font-mono text-sm">{fund ? formatUsdc(fund.fund) : "…"}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="label-mono">Open stop-loss exposure</span>
        <span className="font-mono text-sm">{fund ? formatUsdc(fund.exposure) : "…"}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="label-mono">Protocol Reserve</span>
        <span className="font-mono text-sm">{fund ? formatUsdc(fund.reserve) : "…"}</span>
      </div>
    </section>
  );
}
