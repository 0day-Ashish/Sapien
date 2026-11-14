// In-memory fakes of the external ports. Fakes live only at the ports, never inside
// the system (spec #1, Testing Decisions). Tests assert on what these recorded.

import type {
  ChainPort,
  Cloid,
  DecisionCommitment,
  EpochSettlement,
  ExchangePort,
  Fill,
  Mandate,
  OrderState,
  OrderWithStopLoss,
  OvershootClaim,
  PlacedOrder,
  Position,
  ReduceOnlyOrder,
} from "../ports.js";

export const defaultMandate: Mandate = {
  version: 1,
  allowedAssets: ["BTC", "ETH"],
  leverageCap: 3,
  stopLossPct: 2,
  drawdownCapPct: 10,
  blackoutWindows: [],
  vetoThresholdUsdc: 1_000,
  killFlag: false,
};

export class FakeExchange implements ExchangePort {
  marks = new Map<string, number>();
  orders: OrderWithStopLoss[] = [];
  reduceOnlyOrders: ReduceOnlyOrder[] = [];
  leverage: { vaultId: string; asset: string; leverage: number }[] = [];
  cancelled: Cloid[] = [];
  orderStates = new Map<Cloid, OrderState>();
  positionsByVault = new Map<string, Position[]>();
  accountValueByVault = new Map<string, number>();
  fillsByVault = new Map<string, Fill[]>();
  /** Ledger entries per Vault: signed USDC (deposit +, withdrawal -) and when. */
  flowsByVault = new Map<string, { usdc: number; at: number }[]>();
  /** Set to make order placement throw, like an exchange rejection. */
  rejectOrdersWith?: string;

  constructor(private journal: string[] = []) {}

  async markPrice(asset: string) {
    const mark = this.marks.get(asset);
    if (mark === undefined) throw new Error(`no mark for ${asset}`);
    return mark;
  }
  async setLeverage(vaultId: string, asset: string, leverage: number) {
    this.journal.push("exchange.setLeverage");
    this.leverage.push({ vaultId, asset, leverage });
  }
  async placeOrderWithStopLoss(order: OrderWithStopLoss): Promise<PlacedOrder> {
    this.journal.push("exchange.placeOrderWithStopLoss");
    if (this.rejectOrdersWith) throw new Error(this.rejectOrdersWith);
    this.orders.push(order);
    this.orderStates.set(order.entryCloid, "filled");
    this.orderStates.set(order.stopLoss.cloid, "resting");
    return { entryCloid: order.entryCloid, stopLossCloid: order.stopLoss.cloid, placedAt: Date.now() };
  }
  async placeReduceOnly(order: ReduceOnlyOrder): Promise<PlacedOrder> {
    this.journal.push("exchange.placeReduceOnly");
    if (this.rejectOrdersWith) throw new Error(this.rejectOrdersWith);
    this.reduceOnlyOrders.push(order);
    this.orderStates.set(order.cloid, "filled");
    return { entryCloid: order.cloid, placedAt: Date.now() };
  }
  async orderStatus(_vaultId: string, cloid: Cloid) {
    return this.orderStates.get(cloid) ?? "unknown";
  }
  async cancel(_vaultId: string, cloid: Cloid) {
    this.cancelled.push(cloid);
    this.orderStates.set(cloid, "cancelled");
  }
  async positions(vaultId: string) {
    return this.positionsByVault.get(vaultId) ?? [];
  }
  async accountValue(vaultId: string) {
    return this.accountValueByVault.get(vaultId) ?? 0;
  }
  async fills(vaultId: string) {
    return this.fillsByVault.get(vaultId) ?? [];
  }
  async netFlows(vaultId: string, sinceMs: number) {
    return (this.flowsByVault.get(vaultId) ?? []).filter((f) => f.at > sinceMs).reduce((n, f) => n + f.usdc, 0);
  }
}

export class FakeChain implements ChainPort {
  mandates = new Map<string, Mandate>();
  commitments: DecisionCommitment[] = [];
  /** Vaults reported Flat, in order. */
  flatReports: string[] = [];
  /** Vaults reported not-Flat, in order. */
  notFlatReports: string[] = [];
  /** What each Vault contract holds. A new Vault is Flat, as onchain. */
  flatByVault = new Map<string, boolean>();
  /** When set, reporting not-Flat rejects with this message. */
  failNotFlatWith?: string;
  claims: OvershootClaim[] = [];
  epochSettlements: EpochSettlement[] = [];
  /** Vaults whose settleEpoch rejects. */
  failSettlementFor = new Set<string>();
  belowBondMinimum = new Set<string>();
  /** Set to make currentMandate throw, like an unreadable or tampered Mandate. */
  failMandateReads?: string;
  /** While true, every commitDecision rejects. */
  failCommitments = false;

  constructor(private journal: string[] = []) {}

  async currentMandate(vaultId: string) {
    if (this.failMandateReads) throw new Error(this.failMandateReads);
    return this.mandates.get(vaultId) ?? defaultMandate;
  }
  async commitDecision(commitment: DecisionCommitment) {
    this.journal.push("chain.commitDecision");
    if (this.failCommitments) throw new Error("Decision Commitment failed");
    this.commitments.push(commitment);
    return { txHash: `0x${this.commitments.length.toString(16).padStart(64, "0")}` };
  }
  async isFlat(vaultId: string) {
    return this.flatByVault.get(vaultId) ?? true;
  }
  async reportFlat(vaultId: string, isFlat: boolean) {
    if (!isFlat && this.failNotFlatWith) throw new Error(this.failNotFlatWith);
    this.journal.push(isFlat ? "chain.reportFlat" : "chain.reportNotFlat");
    (isFlat ? this.flatReports : this.notFlatReports).push(vaultId);
    this.flatByVault.set(vaultId, isFlat);
  }
  async submitOvershootClaim(claim: OvershootClaim) {
    this.claims.push(claim);
  }
  exposures: number[] = [];
  async reportExposure(totalUsdc: number) {
    this.exposures.push(totalUsdc);
  }
  async settleEpoch(settlement: EpochSettlement) {
    this.journal.push("chain.settleEpoch");
    if (this.failSettlementFor.has(settlement.vaultId)) throw new Error("FeeRouter.settleEpoch reverted");
    this.epochSettlements.push(settlement);
  }
  async meetsBondMinimum(agentId: string) {
    return !this.belowBondMinimum.has(agentId);
  }
}

/** Both fakes share a journal, so tests can check the order of calls across ports (e.g. commit before order). */
export function fakePorts() {
  const journal: string[] = [];
  return { exchange: new FakeExchange(journal), chain: new FakeChain(journal), journal };
}
