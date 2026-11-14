import { describe, expect, it } from "vitest";
import {
  parseCandleMessage,
  parseCandles,
  parseFills,
  parsePosition,
  parseStopOrders,
} from "../lib/trading/hyperliquid";

const candle = (t: number, c: string) => ({ t, T: t + 59_999, s: "BTC", i: "1m", o: "100", c, h: "110", l: "90", v: "0.5", n: 3 });

describe("parseCandles", () => {
  it("converts ms timestamps to seconds and string prices to numbers, sorted", () => {
    expect(parseCandles([candle(120_000, "105"), candle(60_000, "101")])).toEqual([
      { time: 60, open: 100, high: 110, low: 90, close: 101, volume: 0.5 },
      { time: 120, open: 100, high: 110, low: 90, close: 105, volume: 0.5 },
    ]);
  });

  it("keeps the last candle for a repeated timestamp and drops malformed ones", () => {
    const out = parseCandles([candle(60_000, "101"), { t: 60_000, o: "x" }, candle(60_000, "102"), null]);
    expect(out).toHaveLength(1);
    expect(out[0]!.close).toBe(102);
  });

  it("returns nothing for a non-array response", () => {
    expect(parseCandles({ error: "bad" })).toEqual([]);
  });
});

describe("parseFills", () => {
  const raw = [
    { coin: "BTC", px: "66200.0", sz: "0.01", side: "B", time: 1_700_000_060_000, dir: "Open Long", closedPnl: "0.0", oid: 2 },
    { coin: "BTC", px: "64900.0", sz: "0.01", side: "A", time: 1_700_000_120_000, dir: "Close Long", closedPnl: "-13.0", oid: 3 },
    { coin: "ETH", px: "1880", sz: "1", side: "B", time: 1_700_000_000_000, dir: "Open Long", closedPnl: "0", oid: 4 },
    { coin: "PURR/USDC", px: "5", sz: "1", side: "A", time: 1_700_000_000_000, dir: "Spot Dust Conversion", closedPnl: "0", oid: 5 },
  ];

  it("keeps only the coin's perp fills, with side and PnL", () => {
    expect(parseFills(raw, "BTC")).toEqual([
      { time: 1_700_000_060, price: 66200, size: 0.01, side: "buy", dir: "Open Long", closedPnl: 0, orderId: 2 },
      { time: 1_700_000_120, price: 64900, size: 0.01, side: "sell", dir: "Close Long", closedPnl: -13, orderId: 3 },
    ]);
  });
});

describe("parsePosition", () => {
  const state = {
    assetPositions: [
      { position: { coin: "BTC", szi: "0.02", entryPx: "66000.0", unrealizedPnl: "4.5", leverage: { type: "cross", value: 2 }, liquidationPx: null } },
      { position: { coin: "ETH", szi: "0.0", entryPx: "1880", unrealizedPnl: "0" } },
    ],
  };

  it("reads the open position in a coin", () => {
    expect(parsePosition(state, "BTC")).toEqual({ size: 0.02, entryPrice: 66000, unrealizedPnl: 4.5, leverage: 2, liquidationPrice: null });
  });

  it("treats a zero-size or missing position as flat", () => {
    expect(parsePosition(state, "ETH")).toBeNull();
    expect(parsePosition(state, "SOL")).toBeNull();
    expect(parsePosition({}, "BTC")).toBeNull();
  });
});

describe("parseStopOrders", () => {
  it("keeps the coin's trigger orders only", () => {
    const orders = [
      { coin: "BTC", isTrigger: true, triggerPx: "64680.0", side: "A", sz: "0.02", oid: 9, orderType: "Stop Market", reduceOnly: true },
      { coin: "BTC", isTrigger: false, limitPx: "60000", side: "B", sz: "0.01", oid: 10 },
      { coin: "ETH", isTrigger: true, triggerPx: "1800", side: "A", sz: "1", oid: 11 },
    ];
    expect(parseStopOrders(orders, "BTC")).toEqual([{ orderId: 9, triggerPrice: 64680, side: "sell", size: 0.02 }]);
  });
});

describe("parseCandleMessage", () => {
  it("accepts a candle for the subscribed coin and interval only", () => {
    const msg = { channel: "candle", data: candle(60_000, "103") };
    expect(parseCandleMessage(msg, "BTC", "1m")).toMatchObject({ time: 60, close: 103 });
    expect(parseCandleMessage(msg, "ETH", "1m")).toBeNull();
    expect(parseCandleMessage(msg, "BTC", "5m")).toBeNull();
    expect(parseCandleMessage({ channel: "subscriptionResponse", data: {} }, "BTC", "1m")).toBeNull();
  });
});
