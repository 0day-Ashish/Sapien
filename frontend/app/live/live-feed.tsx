"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ENGINE_URL,
  type FeedItem,
  fetchFeed,
  fetchVaultState,
  fetchVaultStatus,
  type VaultState,
  type VaultStatus,
} from "@/lib/engine-feed";
import { Icon } from "../ui/art";

const POLL_MS = 10_000;
const DEMO_VAULT = process.env.NEXT_PUBLIC_DEMO_VAULT;

const AGENT_NAMES: Record<string, string> = {
  momentum: "Momentum",
  "funding-arb": "Funding-arb",
  "mean-reversion": "Mean-reversion",
};
const agentName = (id?: string) => (id ? (AGENT_NAMES[id] ?? id) : "No agent");

const REGIME_NAMES: Record<string, string> = {
  trend: "Trend",
  chop: "Chop",
  "high-volatility": "High volatility",
  "funding-skew": "Funding skew",
};

const usd = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

function ago(at: number, now: number) {
  if (!now) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

function describe(d: FeedItem): { title: string; tone: string } {
  if (d.error) return { title: `Error: ${d.error}`, tone: "text-orange" };
  const p = d.proposal;
  if (p && d.result?.kind === "executed") {
    const what = p.intent === "open" ? `${p.leverage}× ${p.side}` : `${p.intent} ${p.side}`;
    return { title: `${agentName(p.agentId)}: ${what} ${p.asset}`, tone: "text-green" };
  }
  if (p && d.result?.kind === "rejected") {
    return { title: `${agentName(p.agentId)} ${p.side} ${p.asset} rejected: ${d.result.rejection.code}`, tone: "text-orange" };
  }
  if (p && d.result?.kind === "veto-window") {
    return { title: `${agentName(p.agentId)}: ${p.leverage}× ${p.side} ${p.asset} waiting in its Veto Window`, tone: "text-gold" };
  }
  if (d.result?.kind === "vetoed") {
    return { title: p ? `${agentName(p.agentId)} ${p.side} ${p.asset} vetoed` : `Trade on ${d.asset} vetoed by you`, tone: "text-pink" };
  }
  // The Kill Switch and Epoch settlement log a note that says what happened.
  if (d.result?.kind === "killed" || d.result?.kind === "kill-refused" || d.result?.kind === "epoch-settled") {
    return { title: d.note ?? d.result.kind, tone: d.result.kind === "kill-refused" ? "text-orange" : "text-violet" };
  }
  return { title: `${agentName(d.allocation?.leadAgentId)} holding on ${d.asset}`, tone: "text-violet" };
}

export function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<VaultStatus>();
  const [vault, setVault] = useState<VaultState>();
  // Until someone clicks, show the latest decision that proposed a trade (the interesting one), else the newest.
  const [picked, setPicked] = useState<number>();
  const [error, setError] = useState<string>();
  // Set after mount: reading the clock during render breaks prerendering (cacheComponents).
  const [now, setNow] = useState(0);

  const vaultId = DEMO_VAULT ?? items[0]?.vaultId;

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const feed = await fetchFeed(DEMO_VAULT);
        if (!alive) return;
        setItems(feed);
        setError(undefined);
        const id = DEMO_VAULT ?? feed[0]?.vaultId;
        if (id) {
          const [st, vs] = await Promise.all([fetchVaultStatus(id), fetchVaultState(id)]);
          if (!alive) return;
          setStatus(st);
          setVault(vs);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
      if (alive) setNow(Date.now());
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const latestTrade = items.findIndex((d) => d.proposal);
  const selected = picked ?? Math.max(0, latestTrade);
  const current = items[Math.min(selected, items.length - 1)];
  const pnl = useMemo(() => vault?.positions.reduce((s, p) => s + p.unrealizedPnl, 0) ?? 0, [vault]);

  if (error && items.length === 0) {
    return (
      <div className="card flex flex-col gap-2 p-6 text-ink">
        <p className="font-medium">Can&apos;t reach the engine at {ENGINE_URL}.</p>
        <p className="text-sm text-ink-soft">{error}. Start it with <code>cd engine &amp;&amp; npm run engine</code>, or set NEXT_PUBLIC_ENGINE_URL.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Vault at a glance */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vault value" value={vault ? usd(vault.accountValue) : "…"} sub={vaultId ? short(vaultId) : undefined} />
        <Stat
          label="Unrealized PnL"
          value={vault ? `${pnl >= 0 ? "+" : ""}${usd(pnl)}` : "…"}
          tone={pnl >= 0 ? "text-green" : "text-orange"}
          sub={vault?.positions.map((p) => `${p.size > 0 ? "Long" : "Short"} ${Math.abs(p.size)} ${p.coin} @ ${p.entryPx}`).join(", ") || "Flat"}
        />
        <Stat
          label="Stop-loss protected"
          value={vault?.stops.length ? vault.stops.map((s) => `${s.coin} ${s.triggerPx}`).join(", ") : "No open position"}
          sub={vault?.stops.length ? "Reduce-only stop resting on HyperCore" : undefined}
        />
        <Stat
          label="Lead Agent"
          value={agentName(status?.leadAgent?.agentId)}
          sub={status?.leadAgent?.pendingAgentId ? `Hands over to ${agentName(status.leadAgent.pendingAgentId)} once Flat` : (current?.regime && `Regime: ${REGIME_NAMES[current.regime]}`)}
        />
      </div>

      {status?.automaticKill && (
        <p className="chip chip-clay self-start">Automatic Kill: {status.automaticKill.reason}</p>
      )}

      {/* Agent's-eye view */}
      <div className="grid overflow-hidden rounded-[1.25rem] border border-violet-line bg-violet-soft/70 p-3 shadow-card md:grid-cols-[17rem_1fr]">
        <aside className="flex flex-col gap-2 p-2">
          <p className="flex items-center justify-between px-1 text-xs text-violet/70">
            <span>Decisions, newest first</span>
            <span className="flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${error ? "bg-orange" : "bg-green"}`} /> {error ? "Reconnecting" : "Live"}
            </span>
          </p>
          <ul className="flex max-h-[34rem] flex-col gap-1 overflow-y-auto">
            {items.map((d, i) => {
              const { title, tone } = describe(d);
              return (
                <li key={`${d.at}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setPicked(i)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] text-violet-ink ${i === selected ? "bg-white/90" : "hover:bg-white/50"}`}
                  >
                    <Icon name="chart" className={`mt-0.5 size-4 shrink-0 ${tone}`} />
                    <span className="flex-1 leading-tight">
                      {title}
                      <span className="block text-[0.6875rem] text-violet/60">{ago(d.at, now)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {items.length === 0 && <li className="px-2 text-sm text-violet/70">Waiting for the first decision…</li>}
          </ul>
        </aside>

        <div className="flex min-h-[34rem] flex-col rounded-xl bg-white px-5 py-6 md:px-10">
          {current ? <Decision d={current} now={now} holding={vault?.positions.find((p) => p.coin === current.asset)} /> : <p className="m-auto text-sm text-violet/60">No decisions yet.</p>}
        </div>
      </div>
      <p className="text-xs text-violet/60">
        Live from the Execution Engine on Hyperliquid testnet. Refreshes every {POLL_MS / 1000}s.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-violet-ink" }: { label: string; value: string; sub?: string | undefined; tone?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="label-mono !text-[0.6875rem] text-ink-faint">{label}</span>
      <span className={`text-lg font-medium ${tone}`}>{value}</span>
      {sub && <span className="truncate text-xs text-ink-soft">{sub}</span>}
    </div>
  );
}

function Decision({ d, now, holding }: { d: FeedItem; now: number; holding: VaultState["positions"][number] | undefined }) {
  const p = d.proposal;
  const r = d.result;
  const a = d.allocation;
  const lead = agentName(a?.leadAgentId);
  const odds = a?.probabilities
    ? Object.entries(a.probabilities)
        .sort(([, x], [, y]) => y - x)
        .map(([id, pr]) => `${agentName(id)} ${Math.round(pr * 100)}%`)
        .join(", ")
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <span className="mx-auto rounded-full bg-violet-tint px-3 py-0.5 text-xs text-violet/70">
        {now ? `${new Date(d.at).toLocaleString()} · ${ago(d.at, now)}` : ""}
      </span>

      <p className="self-end rounded-2xl bg-violet-tint px-4 py-2.5 text-sm text-violet-ink">
        What did {lead} see on {d.asset}, and is it inside my Mandate?
      </p>

      {d.error ? (
        <p className="text-sm text-orange">{d.error}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 text-[0.8125rem] text-violet/80">
            <p className="flex items-center gap-2">
              <Icon name="timer" className="size-4" /> What the engine checked
            </p>
            <ul className="ml-2 flex flex-col gap-1.5 border-l border-violet-line pl-4">
              {d.regime && d.metrics && (
                <li>
                  Regime: <b>{REGIME_NAMES[d.regime]}</b> (volatility {(d.metrics.realizedVol * 100).toFixed(2)}% per 4h, trend strength{" "}
                  {d.metrics.trendStrength.toFixed(2)}, funding {(d.metrics.fundingRateHourly * 100).toFixed(4)}%/h)
                </li>
              )}
              {a && (
                <li>
                  Lead Agent: <b>{lead}</b>, chosen by {a.source === "jev" ? "Jev" : "the Bond × track-record rule"}
                  {odds ? ` (${odds})` : ""}
                </li>
              )}
              {r?.kind === "executed" && <li>Read Mandate v{r.decision.mandateVersion}: checks passed</li>}
              {r?.kind === "executed" && <li>Recorded Decision Commitment {short(r.decisionHash)} onchain before the order</li>}
              {r?.kind === "rejected" && <li>Mandate Check: {r.rejection.message}</li>}
            </ul>
          </div>

          {p ? (
            <div className="flex flex-col gap-2 text-sm text-violet-ink">
              <p>{p.rationale}</p>
              <ul className="ml-5 list-disc space-y-1 marker:text-violet">
                <li>
                  {p.intent === "open" ? "Open" : p.intent === "close" ? "Close" : "Reduce"} {p.side}{" "}
                  {Number(p.size.toPrecision(4))} {p.asset}
                  {p.intent === "open" ? ` at ${p.leverage}×` : ""}, confidence {Math.round(p.confidence * 100)}%
                </li>
                {r?.kind === "executed" && r.stopLoss && (
                  <li>Stop-loss rests at {Number(r.stopLoss.triggerPrice.toPrecision(6))}, reduce-only, placed with the entry</li>
                )}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-violet-ink">
              {d.note ??
                (holding
                  ? `${lead} keeps its ${holding.size > 0 ? "long" : "short"} ${d.asset}: its exit rule hasn't fired, so there's nothing to do this tick.`
                  : `${lead} sees no trade on ${d.asset} right now and stays out.`)}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {r?.kind === "executed" && <span className="chip chip-forest">Mandate check passed</span>}
            {r?.kind === "executed" && <span className="chip chip-amber">Commitment {short(r.commitmentTx)}</span>}
            {r?.kind === "rejected" && <span className="chip chip-clay">Rejected: {r.rejection.code}</span>}
            {!p && <span className="chip">No trade</span>}
          </div>
        </>
      )}
    </div>
  );
}
