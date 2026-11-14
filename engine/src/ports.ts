// The Execution Engine's two external ports, injected into `createEngine`.
// Scaffold only (ticket #2): method list follows spec #1; Lane B owns these.

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

export type OrderWithStopLoss = {
  vaultId: VaultId;
  asset: string;
  side: "long" | "short";
  size: number;
  limitPrice?: number;
  stopLossTriggerPrice: number;
};

export type PlacedOrder = { orderId: string; stopLossOrderId: string; placedAt: number };

export type Position = { asset: string; size: number; entryPrice: number };

export type Fill = { orderId: string; price: number; size: number; at: number };

export interface ExchangePort {
  placeOrderWithStopLoss(order: OrderWithStopLoss): Promise<PlacedOrder>;
  cancel(vaultId: VaultId, orderId: string): Promise<void>;
  positions(vaultId: VaultId): Promise<Position[]>;
  accountValue(vaultId: VaultId): Promise<number>;
  fills(vaultId: VaultId): Promise<Fill[]>;
  onFill(listener: (vaultId: VaultId, fill: Fill) => void): () => void;
}

export type DecisionCommitment = { vaultId: VaultId; agentId: AgentId; decisionHash: string };

export type OvershootClaim = {
  vaultId: VaultId;
  positionId: string;
  triggerPrice: number;
  fillPrice: number;
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
