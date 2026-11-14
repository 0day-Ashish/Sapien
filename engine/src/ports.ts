// The Execution Engine's two external ports, injected into `createEngine`. Owned by Lane B.
// Shapes follow spec #1 and the #4 testnet spike findings.

import type { AgentId, VaultId } from "./events.js";

export type Mandate = {
  version: number;
  allowedAssets: string[];
  leverageCap: number;
  stopLossPct: number;
  drawdownCapPct: number;
  blackoutWindows: { start: number; end: number }[];
  vetoThresholdUsdc: number;
  killFlag: boolean;
};

/** Hyperliquid client order id: 0x + 32 hex chars. The engine picks it, so it can track orders the exchange doesn't return ids for. */
export type Cloid = `0x${string}`;

/**
 * An entry with a grouped reduce-only stop-loss (Hyperliquid `normalTpsl`): the stop is cancelled if the entry is,
 * placed when the entry fills (also on a partial IOC fill, at the full ordered size) and cancelled when the position closes.
 */
export type OrderWithStopLoss = {
  vaultId: VaultId;
  asset: string;
  side: "long" | "short";
  size: number;
  /** Worst acceptable entry price (IOC limit). */
  limitPrice: number;
  entryCloid: Cloid;
  stopLoss: { cloid: Cloid; triggerPrice: number };
};

/** A reduce-only order that never adds risk, so it carries no stop-loss. */
export type ReduceOnlyOrder = {
  vaultId: VaultId;
  asset: string;
  side: "long" | "short";
  size: number;
  limitPrice: number;
  cloid: Cloid;
};

export type PlacedOrder = { entryCloid: Cloid; stopLossCloid?: Cloid; placedAt: number };

export type OrderState = "waiting-for-fill" | "resting" | "filled" | "cancelled" | "triggered" | "rejected" | "unknown";

export type Position = { asset: string; size: number; entryPrice: number };

export type Fill = { orderId: string; cloid?: Cloid; price: number; size: number; at: number };

export interface ExchangePort {
  markPrice(asset: string): Promise<number>;
  /** The Agent Wallet can set leverage (#4); it's a separate Hyperliquid action from the order. */
  setLeverage(vaultId: VaultId, asset: string, leverage: number): Promise<void>;
  placeOrderWithStopLoss(order: OrderWithStopLoss): Promise<PlacedOrder>;
  placeReduceOnly(order: ReduceOnlyOrder): Promise<PlacedOrder>;
  /** Looked up by cloid: Hyperliquid's order response omits the stop's oid. */
  orderStatus(vaultId: VaultId, cloid: Cloid): Promise<OrderState>;
  cancel(vaultId: VaultId, cloid: Cloid): Promise<void>;
  positions(vaultId: VaultId): Promise<Position[]>;
  accountValue(vaultId: VaultId): Promise<number>;
  fills(vaultId: VaultId): Promise<Fill[]>;
}

export type DecisionCommitment = { vaultId: VaultId; agentId: AgentId; decisionHash: string };

export type OvershootClaim = {
  vaultId: VaultId;
  positionId: string;
  triggerPrice: number;
  fillPrice: number;
  /** The stop's filled size, not its order size (#4: a stop can be larger than the position it closes). */
  size: number;
  infrastructureFailure: boolean;
  evidenceRef: string;
};

export interface ChainPort {
  currentMandate(vaultId: VaultId): Promise<Mandate>;
  /** Resolves once the commitment is included onchain; rejects if it fails. */
  commitDecision(commitment: DecisionCommitment): Promise<{ txHash: string }>;
  reportFlat(vaultId: VaultId): Promise<void>;
  submitOvershootClaim(claim: OvershootClaim): Promise<void>;
  settleEpoch(epoch: number): Promise<void>;
  meetsBondMinimum(agentId: AgentId): Promise<boolean>;
}

export type Ports = { exchange: ExchangePort; chain: ChainPort };
