"use client";

import { useEffect, useRef, useState } from "react";
import { AGENT_REGISTRY, agentRegistryAbi } from "@/lib/agents/bonds";
import { executionRate, fetchLeaderboard, formatRar, withOnchain, type BoardRow, type OnchainAgent } from "@/lib/engine/leaderboard";
import { ENGINE_URL } from "@/lib/engine/veto";
import { DEMO_LEADERBOARD } from "@/lib/demo/sidebar-demo";
import { hyperClient } from "@/lib/hyperevm";
import { DemoBanner } from "../ui/demo-banner";

const POLL_MS = 10_000;
const ZERO = "0x0000000000000000000000000000000000000000";
const REGIME_LABEL: Record<string, string> = { trend: "Trend", chop: "Chop", "high-volatility": "High volatility", "funding-skew": "Funding skew" };
const usd = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function ago(at?: number) {
  if (!at) return "–";
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** Bond and Vaults led from the AgentRegistry, for agents registered there. */
async function readOnchain(agentIds: string[]): Promise<Map<string, OnchainAgent>> {
  const out = new Map<string, OnchainAgent>();
  if (!AGENT_REGISTRY) return out;
  await Promise.all(
    agentIds.map(async (id) => {
      const a = await hyperClient.readContract({ address: AGENT_REGISTRY!, abi: agentRegistryAbi, functionName: "agent", args: [id] }).catch(
        () => null,
      );
      if (a) out.set(id, { bond: a.bond, ledVaults: a.ledVaults, registered: a.builder !== ZERO });
    }),
  );
  return out;
}

export function LeaderboardTable() {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Showing sample rows: the engine is unreachable or has no agents yet. Live rows replace them as soon as they arrive. */
  const [demo, setDemo] = useState(false);
  const hasLive = useRef(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const board = await fetchLeaderboard();
        const onchain = await readOnchain(board.rows.map((r) => r.agentId));
        if (!live) return;
        const isDemo = board.rows.length === 0;
        hasLive.current = !isDemo;
        setDemo(isDemo);
        setRows(isDemo ? DEMO_LEADERBOARD : withOnchain(board.rows, onchain));
        setUpdated(board.at);
        setError(null);
      } catch (e) {
        if (!live) return;
        setError((e as Error).message);
        // Keep live rows we already have; otherwise show the illustration.
        if (!hasLive.current) {
          setDemo(true);
          setRows(DEMO_LEADERBOARD);
        }
      }
    };
    const first = setTimeout(load, 0);
    const t = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  if (!rows) return <p className="text-sm text-ink-soft">Loading the leaderboard…</p>;

  return (
    <section className="flex flex-col gap-4">
      {demo && (
        <DemoBanner>
          {error ? (
            <>
              An illustration: the engine at <code className="font-mono text-xs">{ENGINE_URL}</code> isn&apos;t reachable. Start it with{" "}
              <code className="font-mono text-xs">cd engine &amp;&amp; npm run engine</code> for live rankings.
            </>
          ) : (
            "An illustration: no agent has traded yet. Live rankings appear here after the first decisions."
          )}
        </DemoBanner>
      )}
      <p className={`items-center gap-2 text-sm text-ink-soft ${demo ? "hidden" : "flex"}`}>
        <span className={`size-2 rounded-full ${error ? "bg-orange" : "animate-pulse bg-green"}`} />
        {error ? `Reconnecting… last updated ${ago(updated ?? undefined)}` : `Live · updated ${updated ? new Date(updated).toLocaleTimeString() : "–"}`}
        {AGENT_REGISTRY && <span className="chip">Bonds read onchain</span>}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-violet-line bg-white shadow-card">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-violet-soft/70 text-violet">
            <tr>
              {["#", "Agent", "Risk-adjusted return", "Bond", "Vaults led", "Fills", "Executed", "Last active"].map((h) => (
                <th key={h} scope="col" className="label-mono px-4 py-3 text-xs font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.agentId} className="border-t border-line transition-colors hover:bg-violet-tint/60">
                <td className="px-4 py-3 font-mono text-violet/70">{i + 1}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-violet-ink">{r.agentId}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {r.regimes.map((g) => (
                      <span key={g} className="rounded-full bg-violet-tint px-2 py-0.5 text-[0.6875rem] text-violet">
                        {REGIME_LABEL[g] ?? g}
                      </span>
                    ))}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className={`font-mono ${r.riskAdjustedReturn.usedPrior ? "text-ink-soft" : r.riskAdjustedReturn.value >= 0 ? "text-green" : "text-orange"}`}>
                    {formatRar(r.riskAdjustedReturn)}
                  </p>
                  <p className="text-xs text-ink-faint">Sharpe over {r.riskAdjustedReturn.epochs} Epoch{r.riskAdjustedReturn.epochs === 1 ? "" : "s"}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono">{usd(r.bondUsdc)} USDC</p>
                  <p className="text-xs text-ink-faint">{r.bondSource === "onchain" ? "onchain" : "engine roster"}</p>
                </td>
                <td className="px-4 py-3 font-mono">{r.vaultsLedCount}</td>
                <td className="px-4 py-3">
                  <p className="font-mono">{r.fills}</p>
                  <p className="text-xs text-ink-faint">{usd(r.filledNotionalUsdc)} USDC filled</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono">
                    {r.executed} / {r.proposals}
                  </p>
                  <p className="text-xs text-ink-faint">{executionRate(r)} passed the Mandate Check</p>
                </td>
                <td className="px-4 py-3 text-ink-soft">{ago(r.lastActiveAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">
        Agents without 2 Epochs of returns show the Allocator&apos;s prior. Testnet results don&apos;t predict future returns.
      </p>
    </section>
  );
}
