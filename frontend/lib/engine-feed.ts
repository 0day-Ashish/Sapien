// Reads the Execution Engine's agent's-eye feed and a Vault's live state on Hyperliquid testnet.
// The engine serves GET /feed and GET /vaults/:id/status (engine/src/service/http.ts); these types mirror its
// RunnerRecord and VaultStatus (engine/src/runner/runner.ts, engine/src/engine.ts).

export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://127.0.0.1:8787";
const HL_INFO = "https://api.hyperliquid-testnet.xyz/info";

export type Regime = "trend" | "chop" | "high-volatility" | "funding-skew";

export type FeedItem = {
  at: number;
  vaultId: string;
  asset: string;
  regime?: Regime;
  metrics?: { realizedVol: number; trendStrength: number; fundingRateHourly: number };
  markPrice?: number;
  allocation?: {
    leadAgentId?: string;
    pendingLeadAgentId?: string;
    reason: string;
    source: "jev" | "rules";
    probabilities?: Record<string, number>;
    confidence?: number;
  };
  proposal?: {
    proposalId: string;
    agentId: string;
    asset: string;
    side: "long" | "short";
    size: number;
    leverage: number;
    intent: "open" | "reduce" | "close";
    confidence: number;
    rationale: string;
  };
  result?:
    | { kind: "ignored" | "handled" }
    // The other kinds the engine logs. The feed needs to tell them apart from a quiet tick, not their details.
    | { kind: "veto-window"; proposalId: string; expiresAt: number }
    | { kind: "vetoed"; proposalId: string }
    | { kind: "killed" | "kill-refused" | "epoch-settled" }
    | { kind: "rejected"; proposalId: string; rejection: { code: string; message: string } }
    | {
        kind: "executed";
        proposalId: string;
        decisionHash: string;
        commitmentTx: string;
        decision: { mandateVersion: number; markPrice: number };
        stopLoss?: { cloid: string; triggerPrice: number; placedAt: number };
      };
  note?: string;
  error?: string;
};

export type VaultStatus = {
  automaticKill?: { trigger: string; reason: string; since: number; asset?: string };
  leadAgent?: { agentId?: string; reason: string; pendingAgentId?: string };
};

export type VaultState = {
  accountValue: number;
  positions: { coin: string; size: number; entryPx: number; unrealizedPnl: number }[];
  stops: { coin: string; triggerPx: number; size: number }[];
};

export async function fetchFeed(vaultId?: string, limit = 40): Promise<FeedItem[]> {
  const q = new URLSearchParams({ limit: String(limit), ...(vaultId ? { vault: vaultId } : {}) });
  const res = await fetch(`${ENGINE_URL}/feed?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Engine feed: HTTP ${res.status}`);
  return ((await res.json()) as { items: FeedItem[] }).items;
}

export async function fetchVaultStatus(vaultId: string): Promise<VaultStatus> {
  const res = await fetch(`${ENGINE_URL}/vaults/${vaultId}/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Engine status: HTTP ${res.status}`);
  return (await res.json()) as VaultStatus;
}

async function hl<T>(body: object): Promise<T> {
  const res = await fetch(HL_INFO, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Hyperliquid: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** The Vault's value, positions and resting stop-losses, read straight from HyperCore. */
export async function fetchVaultState(vaultId: string): Promise<VaultState> {
  type Clearinghouse = {
    marginSummary: { accountValue: string };
    assetPositions: { position: { coin: string; szi: string; entryPx: string; unrealizedPnl: string } }[];
  };
  type OpenOrder = { coin: string; triggerPx: string; sz: string; isTrigger: boolean; reduceOnly: boolean };
  const [ch, orders] = await Promise.all([
    hl<Clearinghouse>({ type: "clearinghouseState", user: vaultId }),
    hl<OpenOrder[]>({ type: "frontendOpenOrders", user: vaultId }),
  ]);
  return {
    accountValue: Number(ch.marginSummary.accountValue),
    positions: ch.assetPositions.map(({ position: p }) => ({
      coin: p.coin,
      size: Number(p.szi),
      entryPx: Number(p.entryPx),
      unrealizedPnl: Number(p.unrealizedPnl),
    })),
    stops: orders.filter((o) => o.isTrigger && o.reduceOnly).map((o) => ({ coin: o.coin, triggerPx: Number(o.triggerPx), size: Number(o.sz) })),
  };
}
