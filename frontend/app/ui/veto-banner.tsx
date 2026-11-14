"use client";

import { useEffect, useRef, useState } from "react";
import { VETO_WORKER_SOURCE, describeVeto, fetchPendingVetoes, newVetoes, secondsLeft, sendVeto, vetoStatusUrl, type PendingVeto, type VetoPoll } from "@/lib/engine/veto";
import { useNearVault } from "../use-near-vault";

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
  // The connected NEAR account's Vault on HyperEVM.
  const { evmVault: vault } = useNearVault();
  const [pending, setPending] = useState<PendingVeto[]>([]);
  // 0 until mounted: reading the clock during render breaks prerendering (cacheComponents). Polls set it.
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const seen = useRef(new Set<string>());

  // Poll the engine for waiting trades; alert once per new window. In a Web Worker, so a background tab still alerts.
  useEffect(() => {
    if (!vault) return;
    let live = true;
    const onPoll = (r: VetoPoll) => {
      if (!live) return;
      // Engine unreachable: show nothing rather than a stale countdown.
      const items = r.ok ? r.items : [];
      newVetoes(seen.current, items).forEach(notify);
      setPending(items);
      setNow(Date.now());
    };
    if (typeof Worker !== "undefined") {
      const src = URL.createObjectURL(new Blob([VETO_WORKER_SOURCE], { type: "text/javascript" }));
      const worker = new Worker(src);
      worker.onmessage = (e: MessageEvent<VetoPoll>) => onPoll(e.data);
      worker.postMessage({ url: vetoStatusUrl(vault), ms: POLL_MS });
      return () => {
        live = false;
        worker.terminate();
        URL.revokeObjectURL(src);
      };
    }
    const poll = () =>
      fetchPendingVetoes(vault).then(
        (items) => onPoll({ ok: true, items }),
        () => onPoll({ ok: false }),
      );
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
