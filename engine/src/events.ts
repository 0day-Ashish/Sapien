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
  /** The fill's asset. Needed to match a fill the engine didn't place (liquidation, manual close) to a stop. */
  asset?: string;
  price: number;
  size: number;
  at: number;
};
export type DepositLanded = {
  type: "deposit-landed";
  vaultId: VaultId;
  amountUsdc: number;
};

/** The Allocator's decision for a Vault. With pendingLeadAgentId, the switch waits until the Vault is Flat. */
export type Allocation = {
  type: "allocation";
  vaultId: VaultId;
  leadAgentId: AgentId | undefined;
  pendingLeadAgentId?: AgentId;
  reason: string;
};

export type EngineEvent =
  | TradeProposal
  | Allocation
  | Veto
  | KillSwitch
  | PriceTick
  | EpochTick
  | FillUpdate
  | DepositLanded;
