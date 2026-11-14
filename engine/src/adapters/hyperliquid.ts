// Hyperliquid implementation of the ExchangePort. Each Vault is a HyperEVM contract that is its own HyperCore
// account (ADR-0004); the Vault's Agent Wallet signs every action and the orders land on the Vault's account.
// Behaviour this relies on was proven on testnet in #4 (see the findings comment there).
//
// viem is pinned to 2.57.10: from 2.57.12 viem rejects the EIP-712 type names Hyperliquid's user-signed actions use.

import { ApiRequestError, ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import type { PrivateKeyAccount } from "viem/accounts";
import type { Candle } from "../agents/types.js";
import type { VaultId } from "../events.js";
import type { Cloid, ExchangePort, Fill, OrderState, OrderWithStopLoss, PlacedOrder, Position, ReduceOnlyOrder } from "../ports.js";

export type HyperliquidExchangeConfig = {
  isTestnet: boolean;
  /** The Vault's Agent Wallet. vaultId is the Vault's address, which is also its HyperCore account. */
  agentFor(vaultId: VaultId): PrivateKeyAccount;
  /** How far past the trigger a stop-market may fill. Hyperliquid's own market TP/SL allows 10%. */
  stopSlippage?: number;
  /** Orders priced further than ~2.5% from the oracle are rejected (#4). Entry limits are clamped inside this band. */
  oracleBand?: number;
};

export class ExchangeError extends Error {
  constructor(message: string, readonly response?: unknown) {
    super(message);
    this.name = "ExchangeError";
  }
}

type AssetMeta = { index: number; szDecimals: number };

export class HyperliquidExchange implements ExchangePort {
  private info: InfoClient;
  private transport: HttpTransport;
  private clients = new Map<VaultId, ExchangeClient>();
  private meta?: Map<string, AssetMeta>;
  private stopSlippage: number;
  private oracleBand: number;

  constructor(private config: HyperliquidExchangeConfig) {
    this.transport = new HttpTransport({ isTestnet: config.isTestnet });
    this.info = new InfoClient({ transport: this.transport });
    this.stopSlippage = config.stopSlippage ?? 0.1;
    this.oracleBand = config.oracleBand ?? 0.02;
  }

  async markPrice(asset: string) {
    return (await this.prices(asset)).mark;
  }

  async setLeverage(vaultId: VaultId, asset: string, leverage: number) {
    const { index } = await this.asset(asset);
    await this.call(() => this.client(vaultId).updateLeverage({ asset: index, isCross: true, leverage }));
  }

  async placeOrderWithStopLoss(order: OrderWithStopLoss): Promise<PlacedOrder> {
    const { index, szDecimals } = await this.asset(order.asset);
    const buy = order.side === "long";
    const size = formatSize(order.size, szDecimals);
    const limit = await this.clampToOracleBand(order.asset, order.limitPrice, buy);
    const trigger = order.stopLoss.triggerPrice;
    const stopLimit = trigger * (buy ? 1 - this.stopSlippage : 1 + this.stopSlippage);

    const res = await this.call(() =>
      this.client(order.vaultId).order({
        orders: [
          { a: index, b: buy, p: formatPrice(limit, szDecimals), s: size, r: false, t: { limit: { tif: "Ioc" } }, c: order.entryCloid },
          {
            a: index,
            b: !buy,
            p: formatPrice(stopLimit, szDecimals),
            s: size,
            r: true,
            t: { trigger: { isMarket: true, triggerPx: formatPrice(trigger, szDecimals), tpsl: "sl" } },
            c: order.stopLoss.cloid,
          },
        ],
        // normalTpsl: the stop is cancelled with an unfilled entry, placed on (even partial) fill, cancelled on close.
        grouping: "normalTpsl",
      }),
    );
    const entry = res.response.data.statuses[0];
    if (entry && typeof entry === "object" && "error" in entry) throw new ExchangeError(String(entry.error), res);
    return { entryCloid: order.entryCloid, stopLossCloid: order.stopLoss.cloid, placedAt: Date.now() };
  }

  async placeReduceOnly(order: ReduceOnlyOrder): Promise<PlacedOrder> {
    const { index, szDecimals } = await this.asset(order.asset);
    // A reduce-only order closes the opposite side: reducing a long sells.
    const buy = order.side === "short";
    const limit = await this.clampToOracleBand(order.asset, order.limitPrice, buy);
    const res = await this.call(() =>
      this.client(order.vaultId).order({
        orders: [{ a: index, b: buy, p: formatPrice(limit, szDecimals), s: formatSize(order.size, szDecimals), r: true, t: { limit: { tif: "Ioc" } }, c: order.cloid }],
        grouping: "na",
      }),
    );
    const status = res.response.data.statuses[0];
    if (status && typeof status === "object" && "error" in status) throw new ExchangeError(String(status.error), res);
    return { entryCloid: order.cloid, placedAt: Date.now() };
  }

  async orderStatus(vaultId: VaultId, cloid: Cloid): Promise<OrderState> {
    const res = await this.info.orderStatus({ user: vaultId as `0x${string}`, oid: cloid });
    if (res.status !== "order") return "unknown";
    const s = res.order.status;
    if (s === "open") return "resting";
    if (s === "filled") return "filled";
    if (s === "triggered") return "triggered";
    if (s === "rejected" || s.endsWith("Rejected")) return "rejected";
    if (s === "canceled" || s.endsWith("Canceled") || s === "scheduledCancel" || s === "internalCancel") return "cancelled";
    return "unknown";
  }

  async cancel(vaultId: VaultId, cloid: Cloid) {
    const res = await this.info.orderStatus({ user: vaultId as `0x${string}`, oid: cloid });
    if (res.status !== "order") return;
    const { index } = await this.asset(res.order.order.coin);
    await this.call(() => this.client(vaultId).cancelByCloid({ cancels: [{ asset: index, cloid }] }));
  }

  async positions(vaultId: VaultId): Promise<Position[]> {
    const ch = await this.info.clearinghouseState({ user: vaultId as `0x${string}` });
    return ch.assetPositions.map((p) => ({ asset: p.position.coin, size: Number(p.position.szi), entryPrice: Number(p.position.entryPx) }));
  }

  async accountValue(vaultId: VaultId) {
    const ch = await this.info.clearinghouseState({ user: vaultId as `0x${string}` });
    return Number(ch.marginSummary.accountValue);
  }

  async fills(vaultId: VaultId): Promise<Fill[]> {
    const fills = await this.info.userFills({ user: vaultId as `0x${string}` });
    return fills.map((f) => ({
      orderId: String(f.oid),
      ...(f.cloid ? { cloid: f.cloid as Cloid } : {}),
      price: Number(f.px),
      size: Number(f.sz),
      at: f.time,
    }));
  }

  // ---------- market data for the Allocator and Specialist Agents (not part of the ExchangePort) ----------

  /** Closed 4h candles, oldest first. */
  async candles4h(asset: string, count = 60): Promise<Candle[]> {
    const H4 = 4 * 3600 * 1000;
    const end = Date.now();
    const rows = await this.info.candleSnapshot({ coin: asset, interval: "4h", startTime: end - (count + 1) * H4, endTime: end });
    return rows
      .map((r) => ({ t: r.t, o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v) }))
      .filter((c) => c.t + H4 <= end); // drop the candle still forming
  }

  /** Current hourly funding rate. */
  async fundingRateHourly(asset: string) {
    const { index } = await this.asset(asset);
    const [, ctxs] = await this.info.metaAndAssetCtxs();
    return Number(ctxs[index]!.funding);
  }

  /** Hourly funding rates over the last `hours`, oldest first. */
  async fundingHistoryHourly(asset: string, hours = 8): Promise<number[]> {
    const rows = await this.info.fundingHistory({ coin: asset, startTime: Date.now() - hours * 3600 * 1000 });
    return rows.map((r) => Number(r.fundingRate));
  }

  // ---------- internals ----------

  private client(vaultId: VaultId) {
    let c = this.clients.get(vaultId);
    if (!c) {
      c = new ExchangeClient({ transport: this.transport, wallet: this.config.agentFor(vaultId) });
      this.clients.set(vaultId, c);
    }
    return c;
  }

  private async asset(name: string): Promise<AssetMeta> {
    if (!this.meta) {
      const meta = await this.info.meta();
      this.meta = new Map(meta.universe.map((u, index) => [u.name, { index, szDecimals: u.szDecimals }]));
    }
    const a = this.meta.get(name);
    if (!a) throw new ExchangeError(`Unknown perp asset ${name}`);
    return a;
  }

  private async prices(asset: string) {
    const { index } = await this.asset(asset);
    const [, ctxs] = await this.info.metaAndAssetCtxs();
    const ctx = ctxs[index];
    if (!ctx) throw new ExchangeError(`No market data for ${asset}`);
    return { mark: Number(ctx.markPx), oracle: Number(ctx.oraclePx) };
  }

  /** Keep an IOC limit inside the oracle band so Hyperliquid doesn't reject it outright; it may then simply not fill. */
  private async clampToOracleBand(asset: string, limit: number, buy: boolean) {
    const { oracle } = await this.prices(asset);
    return buy ? Math.min(limit, oracle * (1 + this.oracleBand)) : Math.max(limit, oracle * (1 - this.oracleBand));
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiRequestError) throw new ExchangeError(e.message, e.response);
      throw e;
    }
  }
}
