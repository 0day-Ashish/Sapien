"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { readContract } from "wagmi/actions";
import { PROTECTION_FUND, protectionFundAbi, type Settlement } from "@/lib/settlement/payouts";
import { formatUsdc } from "@/lib/vault/funds";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";

/** Every settled Overshoot claim, newest first. */
export function PayoutsList() {
  const [rows, setRows] = useState<(Settlement & { id: Hex })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!PROTECTION_FUND) return;
    const read = { chainId: hyperEvmTestnet.id, address: PROTECTION_FUND, abi: protectionFundAbi } as const;
    readContract(wagmiConfig, { ...read, functionName: "claimIds" })
      .then((ids) => Promise.all([...ids].reverse().map(async (id) => ({ id, ...(await readContract(wagmiConfig, { ...read, functionName: "settlement", args: [id] })) }))))
      .then(setRows, (e) => setError((e as Error).message));
  }, []);

  if (!PROTECTION_FUND) return null;
  if (error) return <p role="alert" className="text-sm text-orange">{error}</p>;
  if (!rows) return <p className="text-sm text-ink-soft">Reading payouts…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink-soft">No Overshoot has been settled yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((s) => (
        <li key={s.id}>
          <Link href={`/payouts/${s.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 text-sm hover:border-violet">
            <span className="flex flex-col gap-1">
              <span className="font-mono text-xs text-ink-soft">{new Date(Number(s.settledAt) * 1000).toLocaleString()}</span>
              <span>
                Vault <span className="font-mono">{s.vault.slice(0, 8)}…</span> · {s.agentId}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`chip ${s.infrastructureFailure ? "chip-clay" : "chip-amber"}`}>
                {s.infrastructureFailure ? "Infrastructure Failure" : "Market gap"}
              </span>
              <span className="font-mono">{formatUsdc(s.fromBond + s.fromReserve + s.fromFund)} paid</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
