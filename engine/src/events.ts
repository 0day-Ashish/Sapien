// Events the Execution Engine handles through its one entry point, `handle(event)`.
// Owned by Lane B. Terms follow GLOSSARY.md.

export type VaultId = string;
export type AgentId = string;

/** What a Trade Proposal does to the Vault's position. Only "open" adds risk and gets a new stop-loss. */
export type ProposalIntent = "open" | "reduce" | "close";

export type TradeProposal = {
  type: "trade-proposal";
  /** Unique per proposal, chosen by the proposer. Veto, rejections and replay refer to it. */
  proposalId: string;
  vaultId: VaultId;
  agentId: AgentId;
  asset: string;
  side: "long" | "short";
  /** In units of the asset (e.g. BTC), as Hyperliquid sizes orders. */
  size: number;
  leverage: number;
  intent: ProposalIntent;
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
/** A fill reported by the Hyperliquid adapter. Fills enter only through `handle`, never through a port callback. */
export type FillUpdate = {
  type: "fill";
  vaultId: VaultId;
  cloid?: string;
  orderId: string;
  price: number;
  size: number;
  at: number;
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
