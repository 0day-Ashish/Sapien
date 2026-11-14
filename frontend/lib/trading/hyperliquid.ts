// Read-only market and account data from Hyperliquid testnet, for the live trading chart.
// A Vault is its own HyperCore account (ADR-0004), so its fills, position and resting
// stop-loss orders are read with the Vault's address as the user.

export const HL_INFO_API = "https://api.hyperliquid-testnet.xyz/info";
export const HL_WS_URL = "wss://api.hyperliquid-testnet.xyz/ws";

export const CHART_INTERVALS = ["1m", "5m", "15m", "1h"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

const INTERVAL_SECONDS: Record<ChartInterval, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 };

/** Seconds since the epoch, as the chart expects. */
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Fill = { time: number; price: number; size: number; side: "buy" | "sell"; dir: string; closedPnl: number; orderId: number };
export type Position = { size: number; entryPrice: number; unrealizedPnl: number; leverage: number | null; liquidationPrice: number | null };
export type StopOrder = { orderId: number; triggerPrice: number; side: "buy" | "sell"; size: number };

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** One Hyperliquid candle (`t` in ms, prices as strings) to a chart candle, or null if malformed. */
export function parseCandle(raw: unknown): Candle | null {
  const c = raw as Record<string, unknown> | null;
  if (!c) return null;
  const t = num(c.t);
  const open = num(c.o);
  const high = num(c.h);
  const low = num(c.l);
  const close = num(c.c);
  if (t === null || open === null || high === null || low === null || close === null) return null;
  return { time: Math.floor(t / 1000), open, high, low, close, volume: num(c.v) ?? 0 };
}

/** Candles sorted by time with duplicates removed (the last one for a timestamp wins). */
export function parseCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const byTime = new Map<number, Candle>();
  for (const r of raw) {
    const c = parseCandle(r);
    if (c) byTime.set(c.time, c);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Perp fills for one coin, oldest first. Spot fills (coin like "PURR/USDC") are dropped. */
export function parseFills(raw: unknown, coin: string): Fill[] {
  if (!Array.isArray(raw)) return [];
  const fills: Fill[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (r?.coin !== coin) continue;
    const time = num(r.time);
    const price = num(r.px);
    const size = num(r.sz);
    if (time === null || price === null || size === null) continue;
    fills.push({
      time: Math.floor(time / 1000),
      price,
      size,
      side: r.side === "B" ? "buy" : "sell",
      dir: String(r.dir ?? ""),
      closedPnl: num(r.closedPnl) ?? 0,
      orderId: num(r.oid) ?? 0,
    });
  }
  return fills.sort((a, b) => a.time - b.time);
}

/** The open position in one coin from `clearinghouseState`, or null if flat. */
export function parsePosition(raw: unknown, coin: string): Position | null {
  const positions = (raw as { assetPositions?: { position?: Record<string, unknown> }[] } | null)?.assetPositions;
  if (!Array.isArray(positions)) return null;
  const p = positions.map((a) => a.position).find((pos) => pos?.coin === coin);
  if (!p) return null;
  const size = num(p.szi);
  const entryPrice = num(p.entryPx);
  if (!size || entryPrice === null) return null;
  const leverage = (p.leverage as { value?: unknown } | undefined)?.value;
  return {
    size,
    entryPrice,
    unrealizedPnl: num(p.unrealizedPnl) ?? 0,
    leverage: num(leverage),
    liquidationPrice: num(p.liquidationPx),
  };
}

/** Resting trigger (stop-loss) orders in one coin from `frontendOpenOrders`. */
export function parseStopOrders(raw: unknown, coin: string): StopOrder[] {
  if (!Array.isArray(raw)) return [];
  const stops: StopOrder[] = [];
  for (const o of raw as Record<string, unknown>[]) {
    if (o?.coin !== coin || !o.isTrigger) continue;
    const triggerPrice = num(o.triggerPx);
    if (triggerPrice === null) continue;
    stops.push({ orderId: num(o.oid) ?? 0, triggerPrice, side: o.side === "B" ? "buy" : "sell", size: num(o.sz) ?? 0 });
  }
  return stops;
}

/** A candle update from the WebSocket, for the given coin and interval, or null. */
export function parseCandleMessage(message: unknown, coin: string, interval: ChartInterval): Candle | null {
  const m = message as { channel?: string; data?: Record<string, unknown> } | null;
  if (m?.channel !== "candle" || m.data?.s !== coin || m.data?.i !== interval) return null;
  return parseCandle(m.data);
}

async function info<T>(body: object, fetchFn: typeof fetch = fetch): Promise<T> {
  const res = await fetchFn(HL_INFO_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid info API ${res.status}`);
  return (await res.json()) as T;
}

/** The most recent `count` candles for a coin. */
export async function fetchCandles(coin: string, interval: ChartInterval, count = 240, fetchFn?: typeof fetch) {
  const endTime = Date.now();
  const startTime = endTime - count * INTERVAL_SECONDS[interval] * 1000;
  return parseCandles(await info({ type: "candleSnapshot", req: { coin, interval, startTime, endTime } }, fetchFn));
}

/** A Vault's trading state in one coin: fills, open position and resting stop-loss orders. */
export async function fetchVaultTrading(vault: string, coin: string, fetchFn?: typeof fetch) {
  const [fills, state, orders] = await Promise.all([
    info({ type: "userFills", user: vault }, fetchFn),
    info({ type: "clearinghouseState", user: vault }, fetchFn),
    info({ type: "frontendOpenOrders", user: vault }, fetchFn),
  ]);
  return {
    fills: parseFills(fills, coin),
    position: parsePosition(state, coin),
    stops: parseStopOrders(orders, coin),
    accountValue: num((state as { marginSummary?: { accountValue?: unknown } })?.marginSummary?.accountValue) ?? null,
  };
}
