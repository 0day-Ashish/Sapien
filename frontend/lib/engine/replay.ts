import { parseAbi, type Address, type Hex } from "viem";
import { ENGINE_URL } from "./veto";

// Replay (ticket #20): every executed decision, its record re-hashed in the browser and checked against the onchain
// DecisionLog. Mirrors engine/src/engine.ts (DecisionRecord, hashDecision) and the runner's RunnerRecord.

export const DECISION_LOG = (process.env.NEXT_PUBLIC_DECISION_LOG_ADDRESS ?? "0x6DfD8c2b39b22Ff630691D9b915a3DF8339BDc5D") as Address;
export const decisionLogAbi = parseAbi(["function isCommitted(bytes32 decisionHash) view returns (bool committed, uint64 timestamp)"]);
const HL_INFO = "https://api.hyperliquid-testnet.xyz/info";

export type DecisionRecord = {
  proposal: {
    type: "trade-proposal";
    proposalId: string;
    vaultId: string;
    agentId: string;
    asset: string;
    side: "long" | "short";
    size: number;
    leverage: number;
    intent: "open" | "reduce" | "close";
    confidence: number;
    rationale: string;
  };
  mandateVersion: number;
  markPrice: number;
  order: { limitPrice: number; entryCloid: string; stopLoss?: { cloid: string; triggerPrice: number } };
};

/** One executed decision as the engine logged it. */
export type ReplayItem = {
  at: number;
  vaultId: string;
  asset: string;
  regime?: string;
  metrics?: { realizedVol: number; trendStrength: number; fundingRateHourly: number };
  markPrice?: number;
  allocation?: { leadAgentId?: string; reason: string; source: string };
  note?: string;
  result: {
    kind: "executed";
    proposalId: string;
    decision: DecisionRecord;
    decisionHash: string;
    commitmentTx: string;
    order: { entryCloid: string; stopLossCloid?: string; placedAt: number };
    stopLoss?: { cloid: string; triggerPrice: number; placedAt: number };
  };
};

/** The engine's canonical JSON: keys sorted, undefined dropped, arrays in order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 of the canonical JSON, as 0x-hex: the hash the engine committed onchain before sending the order. */
export async function hashDecision(decision: DecisionRecord): Promise<Hex> {
  const bytes = new TextEncoder().encode(canonicalJson(decision));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export type Verification = {
  recomputed: Hex;
  /** The recomputed hash equals the one the engine logged. */
  matchesLog: boolean;
  /** The recomputed hash is in the onchain DecisionLog, and when it was committed (unix seconds). */
  onchain: { committed: boolean; at?: number };
  /** Holds only if the record hashes to a commitment that is onchain. */
  verified: boolean;
};

/** Re-hashes the record and asks the chain whether that exact hash was committed. */
export async function verifyDecision(
  decision: DecisionRecord,
  loggedHash: string,
  isCommitted: (hash: Hex) => Promise<readonly [boolean, bigint]>,
): Promise<Verification> {
  const recomputed = await hashDecision(decision);
  const [committed, ts] = await isCommitted(recomputed);
  const matchesLog = recomputed.toLowerCase() === loggedHash.toLowerCase();
  return { recomputed, matchesLog, onchain: committed ? { committed, at: Number(ts) } : { committed }, verified: committed && matchesLog };
}

export async function fetchDecisions(vault?: string, fetchFn: typeof fetch = fetch): Promise<ReplayItem[]> {
  const q = new URLSearchParams({ limit: "300", ...(vault ? { vault } : {}) });
  const res = await fetchFn(`${ENGINE_URL}/decisions?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Engine ${res.status}`);
  return ((await res.json()) as { items: ReplayItem[] }).items;
}

export type OrderOutcome = {
  status: string;
  /** Volume-weighted fill price and filled size, when it filled. */
  fill?: { price: number; size: number; at: number; closedPnl: number };
};

export type Execution = { entry: OrderOutcome; stop?: OrderOutcome };

type HlOrderStatus = { status: string; order?: { status: string; order: { oid: number } } };
type HlFill = { oid: number; px: string; sz: string; time: number; closedPnl: string };

async function hl<T>(body: object, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(HL_INFO, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
  return (await res.json()) as T;
}

/** What happened to the order and its stop-loss on HyperCore, looked up by the cloids the engine chose. */
export async function fetchExecution(vault: string, entryCloid: string, stopCloid: string | undefined, fetchFn: typeof fetch = fetch): Promise<Execution> {
  const [fills, entry, stop] = await Promise.all([
    hl<HlFill[]>({ type: "userFills", user: vault }, fetchFn),
    hl<HlOrderStatus>({ type: "orderStatus", user: vault, oid: entryCloid }, fetchFn),
    stopCloid ? hl<HlOrderStatus>({ type: "orderStatus", user: vault, oid: stopCloid }, fetchFn) : Promise.resolve(undefined),
  ]);
  const outcome = (s: HlOrderStatus): OrderOutcome => {
    if (s.status !== "order" || !s.order) return { status: "unknown" };
    const mine = fills.filter((f) => f.oid === s.order!.order.oid);
    const size = mine.reduce((n, f) => n + Number(f.sz), 0);
    if (size === 0) return { status: s.order.status };
    const price = mine.reduce((n, f) => n + Number(f.px) * Number(f.sz), 0) / size;
    const closedPnl = mine.reduce((n, f) => n + Number(f.closedPnl), 0);
    return { status: s.order.status, fill: { price, size, at: Math.max(...mine.map((f) => f.time)), closedPnl } };
  };
  return { entry: outcome(entry), ...(stop ? { stop: outcome(stop) } : {}) };
}
