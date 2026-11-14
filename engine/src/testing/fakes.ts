// In-memory fakes of the external ports. Fakes live only at the ports, never inside
// the system (spec #1, Testing Decisions). Tests assert on what these recorded.

import type {
  ChainPort,
  DecisionCommitment,
  ExchangePort,
  Fill,
  Mandate,
  OrderWithStopLoss,
  OvershootClaim,
  PlacedOrder,
  Position,
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
  orders: OrderWithStopLoss[] = [];
  cancelled: string[] = [];
  positionsByVault = new Map<string, Position[]>();
  accountValueByVault = new Map<string, number>();
  fillsByVault = new Map<string, Fill[]>();
  private listeners = new Set<(vaultId: string, fill: Fill) => void>();
  private nextId = 1;

  async placeOrderWithStopLoss(order: OrderWithStopLoss): Promise<PlacedOrder> {
    this.orders.push(order);
    const id = this.nextId++;
    return { orderId: `o${id}`, stopLossOrderId: `sl${id}`, placedAt: Date.now() };
  }
  async cancel(_vaultId: string, orderId: string) {
    this.cancelled.push(orderId);
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
  onFill(listener: (vaultId: string, fill: Fill) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Test helper: simulate a fill arriving from the exchange. */
  emitFill(vaultId: string, fill: Fill) {
    const fills = this.fillsByVault.get(vaultId) ?? [];
    fills.push(fill);
    this.fillsByVault.set(vaultId, fills);
    for (const l of this.listeners) l(vaultId, fill);
  }
}

export class FakeChain implements ChainPort {
  mandates = new Map<string, Mandate>();
  commitments: DecisionCommitment[] = [];
  flatReports: string[] = [];
  claims: OvershootClaim[] = [];
  settledEpochs: number[] = [];
  belowBondMinimum = new Set<string>();
  /** Set to make the next commitDecision reject. */
  failCommitments = false;

  async currentMandate(vaultId: string) {
    return this.mandates.get(vaultId) ?? defaultMandate;
  }
  async commitDecision(commitment: DecisionCommitment) {
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

export function fakePorts() {
  return { exchange: new FakeExchange(), chain: new FakeChain() };
}
