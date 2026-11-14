"use client";

import { useEffect, useState } from "react";
import { fromU128, formatUsdc } from "@/lib/near/amount";
import type { QuoteSummary } from "@/lib/near/intents";

type Tagged = { amount: string; quote: QuoteSummary | null };

/**
 * A live NEAR Intents quote for the same USDC on the mainnet route (NEAR to HyperCore). Display only: hidden for an
 * invalid amount, and says so when the quote is unavailable.
 */
export function IntentsQuote({ amount }: { amount: string | null }) {
  const [state, setState] = useState<Tagged | null>(null);

  useEffect(() => {
    if (!amount) return;
    const ctl = new AbortController();
    // Wait for the typing to settle, then ask the quote route.
    const t = setTimeout(() => {
      fetch(`/api/intents/quote?amount=${encodeURIComponent(amount)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<QuoteSummary>) : null))
        .catch(() => null)
        .then((quote) => {
          if (!ctl.signal.aborted) setState({ amount, quote });
        });
    }, 600);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [amount]);

  if (!amount) return null;
  const current = state?.amount === amount ? state : null;
  const q = current?.quote;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-violet-line bg-violet-tint p-4 text-sm text-violet-ink">
      <p className="label-mono">NEAR Intents · mainnet route</p>
      {!current ? (
        <p className="text-violet/70">Getting a live quote…</p>
      ) : !q ? (
        <p className="text-violet/70">Quote unavailable right now.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-1">
          <dt>You would send</dt>
          <dd className="font-mono">{formatUsdc(fromU128(q.amountIn))}</dd>
          <dt>Arrives on HyperCore</dt>
          <dd className="font-mono">≈ {formatUsdc(fromU128(q.amountOut))}</dd>
          <dt>Fee</dt>
          <dd className="font-mono">{formatUsdc(fromU128(q.fee))}</dd>
          <dt>Time</dt>
          <dd className="font-mono">≈ {q.etaSeconds}s</dd>
        </dl>
      )}
      <p className="text-xs text-violet/70">
        Mainnet route via NEAR Intents, a live quote. Testnet deposits settle through the Sapien NEAR contract.
      </p>
    </div>
  );
}
