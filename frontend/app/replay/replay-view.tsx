"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { readContract } from "wagmi/actions";
import {
  DECISION_LOG,
  decisionLogAbi,
  fetchDecisions,
  fetchExecution,
  verifyDecision,
  type DecisionRecord,
  type Execution,
  type ReplayItem,
  type Verification,
} from "@/lib/engine/replay";
import { ENGINE_URL } from "@/lib/engine/veto";
import { demoReplayItems, type DemoReplayItem } from "@/lib/demo/sidebar-demo";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";
import { DemoBanner } from "../ui/demo-banner";

const STEPS = ["Inputs", "Rationale", "Trade Proposal", "Mandate Check", "Decision Commitment", "Order", "Fill", "Outcome"] as const;
const STEP_TONES = ["bg-violet", "bg-blue", "bg-teal", "bg-green", "bg-gold", "bg-orange", "bg-pink", "bg-violet-deep"];
/** The same colours for the step chip; listed in full so Tailwind generates them. */
const STEP_CHIPS = ["bg-violet!", "bg-blue!", "bg-teal!", "bg-green!", "bg-gold!", "bg-orange!", "bg-pink!", "bg-violet-deep!"];

const hyperEvmTx = (h: string) => `https://testnet.purrsec.com/tx/${h}`;
const short = (h: string, n = 10) => `${h.slice(0, n)}…${h.slice(-6)}`;
const time = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
const usd = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const isCommitted = (hash: Hex) =>
  readContract(wagmiConfig, { chainId: hyperEvmTestnet.id, address: DECISION_LOG, abi: decisionLogAbi, functionName: "isCommitted", args: [hash] });

export function ReplayView() {
  const [items, setItems] = useState<ReplayItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vaultFilter, setVaultFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  /** Showing sample decisions: the engine is unreachable or has executed nothing yet. */
  const [demo, setDemo] = useState(false);

  /** Sample decisions, labelled as an illustration, so the replay can still be explored. */
  const showDemo = useCallback(async () => {
    const list = await demoReplayItems();
    setDemo(true);
    setItems(list);
    setSelected(list[0]?.result.decisionHash ?? null);
  }, []);

  const load = useCallback(async (vault: string) => {
    setError(null);
    try {
      const list = await fetchDecisions(vault.trim() || undefined);
      if (list.length === 0 && !vault.trim()) return void (await showDemo());
      setDemo(false);
      setItems(list);
      const wanted = new URLSearchParams(window.location.search).get("hash")?.toLowerCase();
      setSelected((cur) => cur ?? list.find((i) => i.result.decisionHash.toLowerCase() === wanted)?.result.decisionHash ?? list[0]?.result.decisionHash ?? null);
    } catch (e) {
      setError((e as Error).message);
      await showDemo();
    }
  }, [showDemo]);

  useEffect(() => {
    const t = setTimeout(() => void load(""), 0);
    return () => clearTimeout(t);
  }, [load]);

  const item = items?.find((i) => i.result.decisionHash === selected) ?? null;

  if (items === null) return <p className="text-sm text-ink-soft">Loading decisions from the engine…</p>;

  return (
    <div className="flex flex-col gap-6">
      {demo && (
        <DemoBanner>
          {error ? (
            <>
              Sample decisions, as an illustration: the engine at <code className="font-mono text-xs">{ENGINE_URL}</code> isn&apos;t
              reachable. Start it with <code className="font-mono text-xs">cd engine &amp;&amp; npm run engine</code> to replay real ones.
            </>
          ) : (
            "Sample decisions, as an illustration: nothing has been executed yet. Real decisions replace these once agents trade."
          )}{" "}
          The hashes are computed for real, so tampering still shows a mismatch.
        </DemoBanner>
      )}
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <aside className="flex flex-col gap-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSelected(null);
            void load(vaultFilter);
          }}
        >
          <input
            className="w-full rounded-lg border border-violet-line bg-white px-3 py-2 font-mono text-xs text-violet-ink focus:border-violet focus:outline-none"
            placeholder="Filter by Vault 0x…"
            value={vaultFilter}
            onChange={(e) => setVaultFilter(e.target.value)}
          />
          <button className="btn btn-secondary">Filter</button>
        </form>
        {!error && items.length === 0 && <p className="text-sm text-ink-soft">No executed decisions yet.</p>}
        <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-2xl border border-violet-line bg-violet-soft/60 p-2">
          {items.map((i) => {
            const p = i.result.decision.proposal;
            const on = i.result.decisionHash === selected;
            return (
              <li key={i.result.decisionHash}>
                <button
                  type="button"
                  onClick={() => setSelected(i.result.decisionHash)}
                  className={`flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${on ? "bg-white shadow-sm" : "hover:bg-white/70"}`}
                >
                  <span className="flex items-center justify-between gap-2 text-violet-ink">
                    <span className="font-medium">
                      {p.agentId} · {p.intent} {p.side} {p.asset}
                    </span>
                    <span className="font-mono text-[0.6875rem] text-violet/60">{short(i.result.decisionHash, 6)}</span>
                  </span>
                  <span className="text-xs text-violet/60">{time(i.at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {item ? <Decision key={item.result.decisionHash} item={item} /> : <div />}
    </div>
    </div>
  );
}

function Decision({ item }: { item: ReplayItem }) {
  const [step, setStep] = useState(STEPS.length - 1);
  const [record, setRecord] = useState<DecisionRecord>(item.result.decision);
  const [tampering, setTampering] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const r = item.result;
  const tampered = useMemo(() => JSON.stringify(record) !== JSON.stringify(r.decision), [record, r.decision]);
  const demoExecution = "demoExecution" in item ? (item as DemoReplayItem).demoExecution : undefined;
  const demo = demoExecution !== undefined;

  // Re-hash on every change to the record (tampering included) and ask the chain.
  useEffect(() => {
    let live = true;
    // A sample decision was never committed onchain: its "chain" is just its own logged hash.
    const lookup = demo ? async (h: Hex) => [h.toLowerCase() === r.decisionHash.toLowerCase(), BigInt(Math.floor(r.order.placedAt / 1000))] as const : isCommitted;
    verifyDecision(record, r.decisionHash, lookup)
      .then((v) => live && (setVerification(v), setVerifyError(null)))
      .catch((e) => live && setVerifyError((e as Error).message));
    return () => {
      live = false;
    };
  }, [record, r.decisionHash, demo, r.order.placedAt]);

  useEffect(() => {
    let live = true;
    if (demoExecution) {
      const t = setTimeout(() => live && setExecution(demoExecution), 0);
      return () => {
        live = false;
        clearTimeout(t);
      };
    }
    fetchExecution(item.vaultId, r.order.entryCloid, r.order.stopLossCloid ?? r.decision.order.stopLoss?.cloid)
      .then((x) => live && setExecution(x))
      .catch(() => live && setExecution({ entry: { status: "unknown" } }));
    return () => {
      live = false;
    };
  }, [demoExecution, item.vaultId, r.order.entryCloid, r.order.stopLossCloid, r.decision.order.stopLoss?.cloid]);

  // Arrow keys scrub.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const p = record.proposal;
  const notional = p.size * record.markPrice;
  const body: Record<(typeof STEPS)[number], React.ReactNode> = {
    Inputs: (
      <Facts
        rows={[
          ["Vault", <span key="v" className="font-mono text-xs break-all">{item.vaultId}</span>],
          ["Regime", item.regime ?? "–"],
          ["Mark price", record.markPrice ? usd(record.markPrice) : "–"],
          ...(item.metrics
            ? ([
                ["Realized volatility", item.metrics.realizedVol.toFixed(4)],
                ["Trend strength", item.metrics.trendStrength.toFixed(2)],
                ["Funding (hourly)", `${(item.metrics.fundingRateHourly * 100).toFixed(4)}%`],
              ] as [string, React.ReactNode][])
            : []),
          ["Lead Agent", item.allocation ? `${item.allocation.leadAgentId ?? "–"} (${item.allocation.source}): ${item.allocation.reason}` : p.agentId],
        ]}
      />
    ),
    Rationale: (
      <div className="flex flex-col gap-2">
        <p className="text-violet-ink">{p.rationale}</p>
        <p className="text-xs text-ink-soft">Confidence {Math.round(p.confidence * 100)}%. The rules made the decision; an LLM only wrote this text.</p>
      </div>
    ),
    "Trade Proposal": (
      <Facts
        rows={[
          ["Agent", p.agentId],
          ["Trade", `${p.intent} ${p.side} ${p.size} ${p.asset}`],
          ["Leverage", `${p.leverage}×`],
          ["Value at mark", `${usd(notional)} USDC`],
          ["Proposal id", <span key="id" className="font-mono text-xs">{p.proposalId}</span>],
        ]}
      />
    ),
    "Mandate Check": (
      <div className="flex flex-col gap-2">
        <p>
          <span className="chip chip-forest">Passed</span> against Mandate v{record.mandateVersion}: asset allowed, leverage under the cap, no
          blackout window, no Automatic Kill or kill flag, Bond Minimum met.
        </p>
        <p className="text-xs text-ink-soft">Only proposals that pass get a Decision Commitment and an order, so every replayable decision passed it.</p>
      </div>
    ),
    "Decision Commitment": (
      <Facts
        rows={[
          ["Decision hash", <span key="h" className="font-mono text-xs break-all">{r.decisionHash}</span>],
          [
            "Committed in",
            <a key="tx" className="font-mono text-xs text-violet underline" href={hyperEvmTx(r.commitmentTx)} target="_blank" rel="noreferrer">
              {short(r.commitmentTx)}
            </a>,
          ],
          ["Onchain at", verification?.onchain.at ? time(verification.onchain.at * 1000) : "–"],
        ]}
      />
    ),
    Order: (
      <Facts
        rows={[
          ["Entry", `IOC limit ${usd(record.order.limitPrice)}`],
          ["Entry cloid", <span key="e" className="font-mono text-xs">{record.order.entryCloid}</span>],
          ...(record.order.stopLoss
            ? ([
                ["Stop-loss", `reduce-only trigger at ${usd(record.order.stopLoss.triggerPrice)}`],
                ["Stop cloid", <span key="s" className="font-mono text-xs">{record.order.stopLoss.cloid}</span>],
              ] as [string, React.ReactNode][])
            : ([["Stop-loss", "none: this trade only reduces"]] as [string, React.ReactNode][])),
          ["Placed", time(r.order.placedAt)],
        ]}
      />
    ),
    Fill: execution ? (
      execution.entry.fill ? (
        <Facts
          rows={[
            ["Status", execution.entry.status],
            ["Filled", `${execution.entry.fill.size} ${p.asset} at ${usd(execution.entry.fill.price)}`],
            ["Slippage vs mark", `${(((execution.entry.fill.price - record.markPrice) / record.markPrice) * 100).toFixed(3)}%`],
            ["At", time(execution.entry.fill.at)],
          ]}
        />
      ) : (
        <p className="text-ink-soft">No fill found on HyperCore (status: {execution.entry.status}).</p>
      )
    ) : (
      <p className="text-ink-soft">Reading HyperCore…</p>
    ),
    Outcome: execution ? (
      execution.stop ? (
        <Facts
          rows={[
            ["Stop-loss", execution.stop.status],
            ...(execution.stop.fill
              ? ([
                  ["Stop filled", `${execution.stop.fill.size} at ${usd(execution.stop.fill.price)}`],
                  ["Realized PnL", `${usd(execution.stop.fill.closedPnl)} USDC`],
                ] as [string, React.ReactNode][])
              : []),
          ]}
        />
      ) : (
        <p className="text-ink-soft">{record.order.stopLoss ? "Stop-loss status unknown." : "A reducing trade: it closes risk, so no stop-loss was attached."}</p>
      )
    ) : (
      <p className="text-ink-soft">Reading HyperCore…</p>
    ),
  };

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <VerifyPanel verification={verification} error={verifyError} tampered={tampered} demo={demo} />

      {/* Scrubber */}
      <div className="card flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className={`chip chip-solid ${STEP_CHIPS[step]}`}>{STEPS[step]}</span>
          <span className="label-mono text-xs text-violet-ink">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={STEPS.length - 1}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          aria-label="Scrub through the decision"
          className="w-full accent-[var(--color-violet)]"
        />
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(i)}
              aria-label={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? STEP_TONES[i] : "bg-violet-line"}`}
            />
          ))}
        </div>
        <p className="text-xs text-ink-faint">Drag, click a segment, or use ← →.</p>
      </div>

      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`card flex gap-4 p-5 transition-opacity duration-300 ${i <= step ? "opacity-100" : "opacity-35"} ${i === step ? "ring-2 ring-violet/40" : ""}`}
          >
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${STEP_TONES[i]}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
              <p className="label-mono text-violet">
                {String(i + 1).padStart(2, "0")} · {s}
              </p>
              {body[s]}
            </div>
          </li>
        ))}
      </ol>

      {/* Tamper */}
      <div className="card flex flex-col gap-3 p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-violet-ink">Try to tamper with it</p>
            <p className="text-ink-soft">Change the record here and watch the commitment check fail. Nothing is sent anywhere.</p>
          </div>
          {!tampering ? (
            <button type="button" className="btn btn-secondary" onClick={() => setTampering(true)}>
              Tamper
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setRecord(r.decision);
                setTampering(false);
              }}
            >
              Restore
            </button>
          )}
        </div>
        {tampering && (
          <div className="grid gap-3 sm:grid-cols-3">
            <TamperField label="Size" value={String(p.size)} onChange={(v) => setRecord({ ...record, proposal: { ...p, size: Number(v) } })} />
            <TamperField label="Leverage" value={String(p.leverage)} onChange={(v) => setRecord({ ...record, proposal: { ...p, leverage: Number(v) } })} />
            <TamperField label="Mark price" value={String(record.markPrice)} onChange={(v) => setRecord({ ...record, markPrice: Number(v) })} />
          </div>
        )}
      </div>
    </section>
  );
}

function VerifyPanel({ verification, error, tampered, demo }: { verification: Verification | null; error: string | null; tampered: boolean; demo: boolean }) {
  if (error) return <div className="card p-5 text-sm text-orange">Couldn&apos;t check the DecisionLog: {error}</div>;
  if (!verification) return <div className="card p-5 text-sm text-ink-soft">Hashing the record and checking the DecisionLog…</div>;
  const ok = verification.verified;
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-5 text-sm ${ok ? "border-green/40 bg-green-soft/60" : "border-orange/40 bg-orange-soft/60"}`}>
      <p className="flex flex-wrap items-center gap-2">
        <span className={`chip ${ok ? "chip-forest" : "chip-clay"}`}>{ok ? "Verified" : "Mismatch"}</span>
        <span className="font-medium text-ink">
          {demo
            ? ok
              ? "Sample record: it hashes to its logged commitment. For a real decision this hash is looked up in the onchain DecisionLog."
              : "The edited record no longer hashes to its commitment, so the check fails, just as it would onchain."
            : ok
              ? "This record hashes to a Decision Commitment recorded onchain before the order was sent."
              : tampered
                ? "The edited record no longer hashes to anything committed onchain."
                : "This record's hash isn't in the onchain DecisionLog."}
        </span>
      </p>
      <dl className="grid gap-1 sm:grid-cols-[10rem_1fr]">
        <dt className="text-ink-soft">Recomputed hash</dt>
        <dd className="font-mono text-xs break-all">{verification.recomputed}</dd>
        <dt className="text-ink-soft">Matches the engine log</dt>
        <dd>{verification.matchesLog ? "yes" : "no"}</dd>
        <dt className="text-ink-soft">{demo ? "Matches its commitment" : "In the DecisionLog"}</dt>
        <dd>{verification.onchain.committed ? `yes, at ${time(verification.onchain.at! * 1000)}` : "no"}</dd>
      </dl>
    </div>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="min-w-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function TamperField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-mono text-violet">{label}</span>
      <input
        type="number"
        step="any"
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-violet-line bg-white px-3 py-2 font-mono text-sm focus:border-violet focus:outline-none"
      />
    </label>
  );
}
