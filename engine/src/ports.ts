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
  /** The size an order will actually carry: `size` rounded down to the asset's size step, as the exchange sends it. */
  orderSize(asset: string, size: number): Promise<number>;
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
  /** Deposits minus withdrawals (USDC) on the Vault's perp account since `sinceMs`, fee collections included. */
  netFlows(vaultId: VaultId, sinceMs: number): Promise<number>;
}

export type DecisionCommitment = { vaultId: VaultId; agentId: AgentId; decisionHash: string };

export type OvershootClaim = {
  vaultId: VaultId;
  /** The Lead Agent whose position it was: its Bond is slashed first for a market gap. */
  agentId: AgentId;
  /** The stop-loss order's cloid: one claim per position. */
  positionId: string;
  triggerPrice: number;
  fillPrice: number;
  /** The stop's filled size, not its order size (#4: a stop can be larger than the position it closes). */
  size: number;
  infrastructureFailure: boolean;
  /** The evidence as JSON (stop cloid, placement time, its state on HyperCore, the fill): hashed and kept onchain. */
  evidenceRef: string;
  /** The Vault's value now (USDC), the Protection Fund cap's basis if no Epoch-start value was reported yet. */
  vaultValueUsdc: number;
};

/** One Vault's Epoch settlement (#17), for the FeeRouter. */
export type EpochSettlement = {
  vaultId: VaultId;
  epoch: number;
  /** The Vault's value now (USDC): measured against its High-Water Mark, and the Protection Fund cap's basis. */
  valueUsdc: number;
  /** Deposits minus withdrawals since the last settlement: shift the High-Water Mark, never profit or loss. */
  netFlowsUsdc: number;
  /** The Lead Agent this Epoch, whose Builder earns the performance fee. */
  agentId: AgentId | undefined;
  /** Recalibrated premium rate, a fraction of notional (premium.ts). */
  premiumRate: number;
  /** Notional the Vault traded this Epoch: the base premium's basis. */
  tradedNotionalUsdc: number;
};

export interface ChainPort {
  currentMandate(vaultId: VaultId): Promise<Mandate>;
  /** Resolves once the commitment is included onchain; rejects if it fails. */
  commitDecision(commitment: DecisionCommitment): Promise<{ txHash: string }>;
  /** Whether the Vault contract currently holds the Vault to be Flat. */
  isFlat(vaultId: VaultId): Promise<boolean>;
  /**
   * Tells the Vault contract whether the Vault is Flat. Not-Flat locks withdrawal and makes a looser Mandate Version
   * wait; Flat unlocks both.
   */
  reportFlat(vaultId: VaultId, isFlat: boolean): Promise<void>;
  submitOvershootClaim(claim: OvershootClaim): Promise<void>;
  /** Total open stop-loss exposure (USDC), the Coverage Ratio's denominator. */
  reportExposure(totalUsdc: number): Promise<void>;
  /** Settles one Vault's Epoch: fees above the High-Water Mark, premiums, and its Epoch-start value for the Fund cap. */
  settleEpoch(settlement: EpochSettlement): Promise<void>;
  meetsBondMinimum(agentId: AgentId): Promise<boolean>;
}

export type Ports = { exchange: ExchangePort; chain: ChainPort };
