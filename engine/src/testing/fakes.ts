// In-memory fakes of the external ports. Fakes live only at the ports, never inside
// the system (spec #1, Testing Decisions). Tests assert on what these recorded.

import type {
  ChainPort,
  Cloid,
  DecisionCommitment,
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
  vetoThresholdUsdc: 500,
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
    this.orders.push(order);
    this.orderStates.set(order.entryCloid, "filled");
    this.orderStates.set(order.stopLoss.cloid, "resting");
    return { entryCloid: order.entryCloid, stopLossCloid: order.stopLoss.cloid, placedAt: Date.now() };
  }
  async placeReduceOnly(order: ReduceOnlyOrder): Promise<PlacedOrder> {
    this.journal.push("exchange.placeReduceOnly");
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
}

export class FakeChain implements ChainPort {
  mandates = new Map<string, Mandate>();
  commitments: DecisionCommitment[] = [];
  flatReports: string[] = [];
  claims: OvershootClaim[] = [];
  settledEpochs: number[] = [];
  belowBondMinimum = new Set<string>();
  /** While true, every commitDecision rejects. */
  failCommitments = false;

  constructor(private journal: string[] = []) {}

  async currentMandate(vaultId: string) {
    return this.mandates.get(vaultId) ?? defaultMandate;
  }
  async commitDecision(commitment: DecisionCommitment) {
    this.journal.push("chain.commitDecision");
    if (this.failCommitments) throw new Error("Decision Commitment failed");
    this.commitments.push(commitment);
    return { txHash: `0x${this.commitments.length.toString(16).padStart(64, "0")}` };
  }
  async reportFlat(vaultId: string) {
    this.flatReports.push(vaultId);
  }
  async submitOvershootClaim(claim: OvershootClaim) {
    this.claims.push(claim);
  }
  async settleEpoch(epoch: number) {
    this.settledEpochs.push(epoch);
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
