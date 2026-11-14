"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useConnection } from "wagmi";
import { readContract } from "wagmi/actions";
import { describeVeto, fetchPendingVetoes, secondsLeft, sendVeto, type PendingVeto } from "@/lib/engine/veto";
import { VAULT_FACTORY, factoryAbi } from "@/lib/vault/funds";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";

const ZERO = "0x0000000000000000000000000000000000000000";
const POLL_MS = 1_000;

type Outcome = { proposalId: string; text: string; tone: "chip-forest" | "chip-clay" };

/** Shows the browser notification for a new Veto Window, if the user turned alerts on. */
function notify(p: PendingVeto) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const n = new Notification(`Veto Window: ${secondsLeft(p, Date.now())}s to stop this trade`, {
    body: describeVeto(p),
    tag: `veto-${p.proposalId}`,
    requireInteraction: true,
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

/** Site-wide countdown banner for trades waiting in their Veto Window, with one-click veto. */
export function VetoBanner() {
  const { address, status } = useConnection();
  const [vault, setVault] = useState<Address | null>(null);
  const [pending, setPending] = useState<PendingVeto[]>([]);
  // 0 until mounted: reading the clock during render breaks prerendering (cacheComponents). Polls set it.
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const seen = useRef(new Set<string>());

  // The connected owner's Vault.
  useEffect(() => {
    if (status !== "connected" || !address) return;
    let live = true;
    readContract(wagmiConfig, { chainId: hyperEvmTestnet.id, address: VAULT_FACTORY, abi: factoryAbi, functionName: "depositTargetOf", args: [address] })
      .then((v) => live && setVault(v === ZERO ? null : v))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address, status]);

  // Poll the engine for waiting trades; alert once per new window.
  useEffect(() => {
    if (!vault) return;
    let live = true;
    const poll = async () => {
      try {
        const items = await fetchPendingVetoes(vault);
        if (!live) return;
        for (const p of items) {
          if (!seen.current.has(p.proposalId)) {
            seen.current.add(p.proposalId);
            notify(p);
          }
        }
        setPending(items);
      } catch {
        // Engine unreachable: show nothing rather than a stale countdown.
        if (live) setPending([]);
      }
      if (live) setNow(Date.now());
    };
    const first = setTimeout(poll, 0);
    const t = setInterval(poll, POLL_MS);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [vault]);

  // Smooth countdown between polls.
  useEffect(() => {
    if (pending.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [pending.length]);

  useEffect(() => {
    if (!outcome) return;
    const t = setTimeout(() => setOutcome(null), 6_000);
    return () => clearTimeout(t);
  }, [outcome]);

  async function veto(p: PendingVeto) {
    if (!vault) return;
    setBusy(p.proposalId);
    try {
      const ok = await sendVeto(vault, p.proposalId);
      setPending((list) => list.filter((x) => x.proposalId !== p.proposalId));
      setOutcome(
        ok
          ? { proposalId: p.proposalId, text: "Vetoed. Nothing was committed or sent.", tone: "chip-forest" }
          : { proposalId: p.proposalId, text: "Too late: the Veto Window had already ended.", tone: "chip-clay" },
      );
    } catch (e) {
      setOutcome({ proposalId: p.proposalId, text: `Couldn't reach the engine: ${(e as Error).message}`, tone: "chip-clay" });
    } finally {
      setBusy(null);
    }
  }

  const open = pending.filter((p) => p.expiresAt > now);
  if (open.length === 0 && !outcome) return null;

  return (
    <div role="region" aria-label="Veto Window" aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-4 z-[60] flex flex-col items-center gap-3">
      {open.map((p) => {
        const left = secondsLeft(p, now);
        const total = Math.max(1, (p.expiresAt - p.openedAt) / 1000);
        return (
          <div key={p.proposalId} className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-orange/40 bg-white shadow-card">
            <div className="h-1 bg-orange-soft">
              <div className="h-full bg-orange transition-[width] duration-300 ease-linear" style={{ width: `${(left / total) * 100}%` }} />
            </div>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-amber tabular-nums">Veto Window · {left}s</span>
                  <span className="text-sm font-medium text-violet-ink">{describeVeto(p)}</span>
                </p>
                <p className="truncate text-xs text-ink-soft" title={p.rationale}>
                  {p.rationale}
                </p>
                <p className="text-xs text-ink-faint">If you don&apos;t veto, it is Mandate Checked again at the current price, then sent with a slippage cap or dropped.</p>
              </div>
              <button
                type="button"
                onClick={() => veto(p)}
                disabled={busy === p.proposalId}
                className="btn shrink-0 border-orange bg-orange text-white hover:bg-orange/90 disabled:opacity-60"
              >
                {busy === p.proposalId ? "Vetoing…" : "Veto"}
              </button>
            </div>
          </div>
        );
      })}
      {outcome && (
        <p className="pointer-events-auto rounded-full bg-white px-4 py-2 text-sm shadow-card">
          <span className={`chip ${outcome.tone}`}>{outcome.tone === "chip-forest" ? "Vetoed" : "Not vetoed"}</span> {outcome.text}
        </p>
      )}
    </div>
  );
}

/** Lets the user turn on browser notifications for Veto Windows. */
export function VetoAlerts() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="card flex flex-col gap-3 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">Veto alerts</h2>
        <p className="text-sm text-ink-soft">
          Trades above your veto threshold wait 60 seconds before they are sent. Get a browser notification when one is waiting, so
          you can stop it even with this tab in the background.
        </p>
      </div>
      {permission === "granted" ? (
        <p className="text-sm">
          <span className="chip chip-forest">On</span> You&apos;ll be notified while this site is open in a tab, even in the background.
        </p>
      ) : permission === "denied" ? (
        <p className="text-sm">
          <span className="chip chip-clay">Blocked</span> Notifications are blocked for this site. Allow them in your browser&apos;s site settings.
        </p>
      ) : permission === "unsupported" ? (
        <p className="text-sm text-ink-soft">This browser doesn&apos;t support notifications. The countdown banner still appears on every page.</p>
      ) : (
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => Notification.requestPermission().then(setPermission)}>
            Turn on veto alerts
          </button>
        </div>
      )}
    </section>
  );
}
