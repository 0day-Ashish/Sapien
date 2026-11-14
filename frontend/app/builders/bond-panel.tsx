"use client";

import { useCallback, useEffect, useState } from "react";
import { erc20Abi, type Address, type Hash } from "viem";
import { useConnection } from "wagmi";
import { readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import {
  AGENT_REGISTRY,
  REGIMES,
  agentRegistryAbi,
  bondStatus,
  canStartUnbonding,
  regimeLabels,
  type AgentBond,
} from "@/lib/agents/bonds";
import { HYPEREVM_USDC, formatUsdc, parseUsdc } from "@/lib/vault/funds";
import { hyperEvmTestnet, wagmiConfig } from "@/lib/wagmi";

const ZERO = "0x0000000000000000000000000000000000000000";
const LAST_AGENT_KEY = "sapien.builder.agentId";
const errorText = (e: unknown) => (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
const inputClass = "w-full rounded-md border border-line bg-cream-raised p-3 font-mono text-sm";
const hyperEvmTx = (h: string) => `https://testnet.purrsec.com/tx/${h}`;

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
  const read = { chainId: hyperEvmTestnet.id, address: registry, abi: agentRegistryAbi } as const;
  const [a, bondMinimum, meetsBondMinimum] = await Promise.all([
    readContract(wagmiConfig, { ...read, functionName: "agent", args: [agentId] }),
    readContract(wagmiConfig, { ...read, functionName: "bondMinimum", args: [agentId] }),
    readContract(wagmiConfig, { ...read, functionName: "meetsBondMinimum", args: [agentId] }),
  ]);
  if (a.builder === ZERO) return null;
  return { ...a, bondMinimum, meetsBondMinimum };
}

/** Approves the registry for `amount` HyperEVM USDC if needed, then sends `write`. Returns the last tx hash. */
async function withAllowance(owner: Address, registry: Address, amount: bigint, write: () => Promise<Hash>) {
  await switchChain(wagmiConfig, { chainId: hyperEvmTestnet.id });
  if (amount > BigInt(0)) {
    const allowance = await readContract(wagmiConfig, {
      chainId: hyperEvmTestnet.id,
      address: HYPEREVM_USDC,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, registry],
    });
    if (allowance < amount) {
      const approve = await writeContract(wagmiConfig, {
        chainId: hyperEvmTestnet.id,
        address: HYPEREVM_USDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [registry, amount],
      });
      await waitForTransactionReceipt(wagmiConfig, { chainId: hyperEvmTestnet.id, hash: approve });
    }
  }
  const tx = await write();
  const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: hyperEvmTestnet.id, hash: tx });
  if (receipt.status !== "success") throw new Error("The transaction reverted");
  return tx;
}

export function BondPanel() {
  const { address, status } = useConnection();
  const [wallet, setWallet] = useState<bigint | null>(null);
  const [agentId, setAgentId] = useState("");

  const refreshWallet = useCallback(async () => {
    if (!address) return;
    setWallet(
      await readContract(wagmiConfig, {
        chainId: hyperEvmTestnet.id,
        address: HYPEREVM_USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }),
    );
  }, [address]);

  useEffect(() => {
    const first = setTimeout(() => {
      setAgentId((id) => id || recall());
      void refreshWallet().catch(() => {});
    }, 0);
    return () => clearTimeout(first);
  }, [refreshWallet]);

  if (!AGENT_REGISTRY) {
    return (
      <div className="card p-6 text-sm">
        The AgentRegistry isn&apos;t configured. Set <code className="font-mono">NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS</code>{" "}
        to its HyperEVM testnet address.
      </div>
    );
  }
  if (status !== "connected" || !address) return <p className="text-sm text-ink-soft">Connect your wallet to manage your Bonds.</p>;

  const use = (id: string) => {
    setAgentId(id);
    remember(id);
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-soft">
        Wallet: <strong>{wallet === null ? "…" : formatUsdc(wallet)}</strong> on HyperEVM testnet
      </p>
      <AgentCard
        key={agentId}
        registry={AGENT_REGISTRY}
        owner={address}
        agentId={agentId}
        onAgentId={use}
        onChange={refreshWallet}
      />
      <RegisterCard
        registry={AGENT_REGISTRY}
        owner={address}
        onRegistered={(id) => {
          use(id);
          void refreshWallet();
        }}
      />
    </div>
  );
}

function TxResult({ tx, error }: { tx: string | null; error: string | null }) {
  return (
    <>
      {tx && (
        <p className="text-sm">
          <span className="chip chip-forest">Done</span>{" "}
          <a className="font-mono text-xs text-violet underline" href={hyperEvmTx(tx)} target="_blank" rel="noreferrer">
            {tx.slice(0, 10)}…
          </a>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-orange">
          {error}
        </p>
      )}
    </>
  );
}

function RegisterCard(props: { registry: Address; owner: Address; onRegistered: (agentId: string) => void }) {
  const { registry, owner, onRegistered } = props;
  const [id, setId] = useState("");
  const [regimes, setRegimes] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = id.trim();
  const bond = input.trim() === "" ? BigInt(0) : parseUsdc(input);

  async function register() {
    if (bond === null) return;
    setBusy(true);
    setError(null);
    setTx(null);
    try {
      const existing = await readAgent(registry, trimmed);
      if (existing) throw new Error(`"${trimmed}" is already registered. Pick another agent id.`);
      const hash = await withAllowance(owner, registry, bond, () =>
        writeContract(wagmiConfig, {
          chainId: hyperEvmTestnet.id,
          address: registry,
          abi: agentRegistryAbi,
          functionName: "register",
          args: [trimmed, regimes, bond],
        }),
      );
      setTx(hash);
      onRegistered(trimmed);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">Register an agent</h2>
        <p className="text-sm text-ink-soft">
          You become its Builder. You never hold a Vault&apos;s trading key: your agent sends Trade Proposals, and the
          Execution Engine Mandate Checks them.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="label-mono">Agent id</span>
        <input className={inputClass} value={id} placeholder="momentum" onChange={(e) => setId(e.target.value)} />
      </label>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="label-mono mb-2">Regimes it may lead in</legend>
        <div className="flex flex-wrap gap-4">
          {REGIMES.map((r) => (
            <label key={r.bit} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={(regimes & r.bit) !== 0}
                onChange={(e) => setRegimes((b) => (e.target.checked ? b | r.bit : b & ~r.bit))}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-2 text-sm">
        <span className="label-mono">Bond (USDC)</span>
        <input className={inputClass} value={input} placeholder="100" onChange={(e) => setInput(e.target.value)} inputMode="decimal" />
      </label>
      {bond === null && (
        <p role="alert" className="text-sm text-orange">
          Enter a USDC amount with at most 6 decimals.
        </p>
      )}
      <div>
        <button className="btn btn-primary" disabled={busy || !trimmed || regimes === 0 || bond === null} onClick={register}>
          {busy ? "Registering…" : bond ? "Register and stake" : "Register"}
        </button>
      </div>
      <TxResult tx={tx} error={error} />
    </section>
  );
}

function AgentCard(props: {
  registry: Address;
  owner: Address;
  agentId: string;
  onAgentId: (id: string) => void;
  onChange: () => Promise<void>;
}) {
  const { registry, owner, agentId, onAgentId, onChange } = props;
  const [lookup, setLookup] = useState(agentId);
  const [agent, setAgent] = useState<AgentBond | null | undefined>(undefined);
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
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

  async function run(fn: () => Promise<Hash>) {
    setBusy(true);
    setError(null);
    setTx(null);
    try {
      setTx(await fn());
      await Promise.all([refresh(), onChange()]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const write = (functionName: "startUnbonding" | "withdrawBond") => () =>
    run(() =>
      withAllowance(owner, registry, BigInt(0), () =>
        writeContract(wagmiConfig, { chainId: hyperEvmTestnet.id, address: registry, abi: agentRegistryAbi, functionName, args: [agentId] }),
      ),
    );

  const amount = parseUsdc(input);
  const topUp = () =>
    run(async () => {
      if (!amount) throw new Error("Enter an amount");
      const hash = await withAllowance(owner, registry, amount, () =>
        writeContract(wagmiConfig, { chainId: hyperEvmTestnet.id, address: registry, abi: agentRegistryAbi, functionName: "topUp", args: [agentId, amount] }),
      );
      setInput("");
      return hash;
    });

  const isBuilder = agent ? agent.builder.toLowerCase() === owner.toLowerCase() : false;
  const s = agent ? bondStatus(agent, now) : null;

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="display-3">Your agent&apos;s Bond</h2>
        <p className="text-sm text-ink-soft">
          Below the Bond Minimum (5% of the Vaults it leads), your agent may only reduce or close positions and gets no new
          Vaults.
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
        <>
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

          {!isBuilder ? (
            <p className="text-sm text-ink-soft">Only this agent&apos;s Builder can top up or unbond it.</p>
          ) : (
            <>
              <label className="flex flex-col gap-2 text-sm">
                <span className="label-mono">Top up (USDC)</span>
                <div className="flex gap-3">
                  <input className={inputClass} value={input} placeholder="50" onChange={(e) => setInput(e.target.value)} inputMode="decimal" />
                  <button className="btn btn-primary" disabled={busy || !amount} onClick={topUp}>
                    {busy ? "Sending…" : "Top up"}
                  </button>
                </div>
              </label>

              <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
                <p className="label-mono">Unbonding</p>
                {s?.kind === "withdrawable" ? (
                  <div>
                    <button className="btn btn-primary" disabled={busy} onClick={write("withdrawBond")}>
                      Withdraw {formatUsdc(agent.bond)}
                    </button>
                  </div>
                ) : s?.kind === "unbonding" ? (
                  <p>The Bond stays locked, and slashable, until {s.endsAt.toLocaleString()}.</p>
                ) : agent.ledVaults > 0 ? (
                  <p className="text-ink-soft">
                    Your agent leads {agent.ledVaults} Vault{agent.ledVaults === 1 ? "" : "s"}. Unbonding can start once it
                    leads none.
                  </p>
                ) : (
                  <>
                    <p className="text-ink-soft">
                      Starts a 3-day delay. Your agent can&apos;t lead Vaults meanwhile, and the Bond stays slashable until you
                      withdraw it.
                    </p>
                    <div>
                      <button className="btn btn-secondary" disabled={busy || !canStartUnbonding(agent)} onClick={write("startUnbonding")}>
                        Start Unbonding
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
      <TxResult tx={tx} error={error} />
    </section>
  );
}
