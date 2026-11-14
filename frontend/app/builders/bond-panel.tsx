"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import {
  AGENT_REGISTRY,
  agentRegistryAbi,
  bondStatus,
  regimeLabels,
  type AgentBond,
} from "@/lib/agents/bonds";
import { hyperClient } from "@/lib/hyperevm";
import { formatUsdc } from "@/lib/vault/funds";

const ZERO = "0x0000000000000000000000000000000000000000";
const LAST_AGENT_KEY = "sapien.builder.agentId";
const errorText = (e: unknown) => (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
const inputClass = "w-full rounded-md border border-line bg-cream-raised p-3 font-mono text-sm";

function remember(agentId: string) {
  try {
    localStorage.setItem(LAST_AGENT_KEY, agentId);
  } catch {}
}

function recall(): string {
  try {
    return localStorage.getItem(LAST_AGENT_KEY) ?? "";
  } catch {
    return "";
  }
}

async function readAgent(registry: Address, agentId: string): Promise<AgentBond | null> {
  const read = { address: registry, abi: agentRegistryAbi } as const;
  const [a, bondMinimum, meetsBondMinimum] = await Promise.all([
    hyperClient.readContract({ ...read, functionName: "agent", args: [agentId] }),
    hyperClient.readContract({ ...read, functionName: "bondMinimum", args: [agentId] }),
    hyperClient.readContract({ ...read, functionName: "meetsBondMinimum", args: [agentId] }),
  ]);
  if (a.builder === ZERO) return null;
  return { ...a, bondMinimum, meetsBondMinimum };
}

export function BondPanel() {
  const [agentId, setAgentId] = useState("");

  useEffect(() => {
    const first = setTimeout(() => setAgentId((id) => id || recall()), 0);
    return () => clearTimeout(first);
  }, []);

  if (!AGENT_REGISTRY) {
    return (
      <div className="card p-6 text-sm">
        The AgentRegistry isn&apos;t configured. Set <code className="font-mono">NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS</code>{" "}
        to its HyperEVM testnet address.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-soft">
        Bonds are read-only here. Registering and topping up a Bond are HyperEVM transactions, and this release signs with a NEAR
        wallet only. Look up any agent to see its Bond.
      </p>
      <AgentCard
        key={agentId}
        registry={AGENT_REGISTRY}
        agentId={agentId}
        onAgentId={(id) => {
          setAgentId(id);
          remember(id);
        }}
      />
    </div>
  );
}

function AgentCard(props: { registry: Address; agentId: string; onAgentId: (id: string) => void }) {
  const { registry, agentId, onAgentId } = props;
  const [lookup, setLookup] = useState(agentId);
  const [agent, setAgent] = useState<AgentBond | null | undefined>(undefined);
  // 0 until the first read: reading the clock during render breaks prerendering (cacheComponents).
  const [now, setNow] = useState(BigInt(0));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!agentId) return;
    setAgent(await readAgent(registry, agentId));
    setNow(BigInt(Math.floor(Date.now() / 1000)));
  }, [registry, agentId]);

  useEffect(() => {
    const tick = () => void refresh().catch((e) => setError(errorText(e)));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  const s = agent ? bondStatus(agent, now) : null;

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">An agent&apos;s Bond</h2>
        <p className="text-sm text-ink-soft">
          Below the Bond Minimum (5% of the Vaults it leads), an agent may only reduce or close positions and gets no new Vaults.
        </p>
      </div>
      <form
        className="flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onAgentId(lookup.trim());
        }}
      >
        <input className={inputClass} value={lookup} placeholder="Agent id" onChange={(e) => setLookup(e.target.value)} />
        <button className="btn btn-secondary" disabled={!lookup.trim()}>
          Look up
        </button>
      </form>

      {!agentId ? null : agent === undefined ? (
        <p className="text-sm text-ink-soft">Reading the Bond…</p>
      ) : agent === null ? (
        <p className="text-sm">No agent named &quot;{agentId}&quot; is registered yet.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-ink-soft">Status</dt>
          <dd>
            {s?.kind === "eligible" && <span className="chip chip-forest">Can lead Vaults</span>}
            {s?.kind === "below-minimum" && <span className="chip chip-clay">Below Bond Minimum by {formatUsdc(s.shortBy)}</span>}
            {s?.kind === "no-bond" && <span className="chip chip-clay">No Bond</span>}
            {s?.kind === "unbonding" && <span className="chip chip-amber">Unbonding until {s.endsAt.toLocaleString()}</span>}
            {s?.kind === "withdrawable" && <span className="chip chip-amber">Ready to withdraw</span>}
          </dd>
          <dt className="text-ink-soft">Bond</dt>
          <dd className="font-mono">{formatUsdc(agent.bond)}</dd>
          <dt className="text-ink-soft">Bond Minimum</dt>
          <dd className="font-mono">{formatUsdc(agent.bondMinimum)}</dd>
          <dt className="text-ink-soft">Leads</dt>
          <dd className="font-mono">
            {agent.ledVaults} Vault{agent.ledVaults === 1 ? "" : "s"} · {formatUsdc(agent.ledValue)}
          </dd>
          <dt className="text-ink-soft">Regimes</dt>
          <dd>{regimeLabels(agent.regimes).join(", ")}</dd>
          <dt className="text-ink-soft">Builder</dt>
          <dd className="font-mono break-all text-xs">{agent.builder}</dd>
        </dl>
      )}
      {error && (
        <p role="alert" className="text-sm text-orange">
          {error}
        </p>
      )}
    </section>
  );
}
