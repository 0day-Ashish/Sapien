// Events the Execution Engine handles through its one entry point, `handle(event)`.
// Scaffold only (ticket #2): shapes follow spec #1 and are owned by Lane B, who will
// flesh them out. Terms follow GLOSSARY.md.

export type VaultId = string;
export type AgentId = string;

export type TradeProposal = {
  type: "trade-proposal";
  vaultId: VaultId;
  agentId: AgentId;
  asset: string;
  side: "long" | "short";
  size: number;
  leverage: number;
  confidence: number;
  rationale: string;
};

export type Veto = { type: "veto"; vaultId: VaultId; proposalId: string };
export type KillSwitch = { type: "kill-switch"; vaultId: VaultId };
export type PriceTick = {
  type: "price-tick";
  asset: string;
  oraclePrice: number;
  referencePrice: number;
  at: number;
};
export type EpochTick = { type: "epoch-tick"; epoch: number };
export type FillUpdate = {
  type: "fill";
  vaultId: VaultId;
  orderId: string;
  price: number;
  size: number;
};
export type DepositLanded = {
  type: "deposit-landed";
  vaultId: VaultId;
  amountUsdc: number;
};

export type EngineEvent =
  | TradeProposal
  | Veto
  | KillSwitch
  | PriceTick
  | EpochTick
  | FillUpdate
  | DepositLanded;
