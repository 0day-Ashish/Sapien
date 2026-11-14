"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { useConnection, useReadContract } from "wagmi";
import {
  CHART_INTERVALS,
  HL_WS_URL,
  fetchCandles,
  fetchVaultTrading,
  parseCandleMessage,
  type Candle,
  type ChartInterval,
  type Fill,
  type Position,
  type StopOrder,
} from "@/lib/trading/hyperliquid";
import { VAULT_FACTORY, factoryAbi } from "@/lib/vault/funds";

const COLORS = {
  up: "#17805a",
  down: "#c8561c",
  violet: "#6a4fd6",
  ink: "#3a2a86",
  grid: "rgba(106, 79, 214, 0.08)",
  text: "#8f89a6",
  pink: "#d4508e",
};

const INTERVAL_SECONDS: Record<ChartInterval, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 };
const TRADING_POLL_MS = 5000;

type Trading = { fills: Fill[]; position: Position | null; stops: StopOrder[]; accountValue: number | null };

const usd = (n: number, digits = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const price = (n: number) => usd(n, n >= 1000 ? 1 : n >= 10 ? 2 : 4);

/**
 * Live chart of the market a Vault trades, with the Lead Agent's fills, the open position's entry,
 * its resting stop-loss and its liquidation price drawn on top. Market data streams over Hyperliquid's
 * WebSocket; the Vault's trading state is polled. Read-only.
 */
export function TradingChart({ assets }: { assets: string[] }) {
  const coins = useMemo(() => (assets.length ? assets : ["BTC", "ETH", "SOL", "HYPE"]), [assets]);
  const [coin, setCoin] = useState(coins[0]!);
  const [interval, setInterval_] = useState<ChartInterval>("1m");
  // Each piece of async state is tagged with what it belongs to, so a stale value is ignored
  // instead of being reset when the coin, interval or Vault changes.
  const [lastState, setLastState] = useState<{ key: string; close: number; open: number } | null>(null);
  const [liveKey, setLiveKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tradingState, setTradingState] = useState<{ key: string; data: Trading } | null>(null);

  const activeCoin = coins.includes(coin) ? coin : coins[0]!;
  const marketKey = `${activeCoin}:${interval}`;

  // The connected owner's Vault, which is its own HyperCore account.
  const { address } = useConnection();
  const { data: vaultAddress } = useReadContract({
    address: VAULT_FACTORY,
    abi: factoryAbi,
    functionName: "depositTargetOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const vault = vaultAddress && vaultAddress !== zeroAddress ? (vaultAddress as Address) : null;
  const tradingKey = vault ? `${vault}:${activeCoin}` : null;

  const last = lastState?.key === marketKey ? lastState : null;
  const live = liveKey === marketKey;
  const error = errorKey === marketKey ? "Couldn't load market data from Hyperliquid testnet." : null;
  const trading = tradingKey && tradingState?.key === tradingKey ? tradingState.data : null;

  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const lines = useRef<IPriceLine[]>([]);

  // Create the chart once.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const c = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: COLORS.text,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });
    chart.current = c;
    series.current = s;
    markers.current = createSeriesMarkers(s, []);
    return () => {
      markers.current = null;
      series.current = null;
      chart.current = null;
      lines.current = [];
      c.remove();
    };
  }, []);

  // Load history, then stream live candles for the chosen coin and interval.
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    const toBar = (c: Candle) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });

    const key = `${activeCoin}:${interval}`;
    fetchCandles(activeCoin, interval)
      .then((candles) => {
        if (cancelled || !series.current) return;
        series.current.setData(candles.map(toBar));
        chart.current?.timeScale().fitContent();
        const lastCandle = candles.at(-1);
        if (lastCandle) setLastState({ key, close: lastCandle.close, open: candles[0]!.open });
      })
      .catch(() => !cancelled && setErrorKey(key));

    const connect = () => {
      socket = new WebSocket(HL_WS_URL);
      socket.onopen = () => {
        socket?.send(JSON.stringify({ method: "subscribe", subscription: { type: "candle", coin: activeCoin, interval } }));
        setLiveKey(key);
      };
      socket.onmessage = (event) => {
        let message: unknown;
        try {
          message = JSON.parse(event.data as string);
        } catch {
          return;
        }
        const c = parseCandleMessage(message, activeCoin, interval);
        if (!c || !series.current) return;
        try {
          series.current.update(toBar(c));
        } catch {
          return; // an update older than the last bar; ignore it
        }
        setLastState((prev) => ({ key, close: c.close, open: prev?.key === key ? prev.open : c.open }));
      };
      socket.onclose = () => {
        setLiveKey((k) => (k === key ? null : k));
        if (!cancelled) retry = window.setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [activeCoin, interval]);

  // Poll the Vault's fills, position and stop-loss orders.
  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    const key = `${vault}:${activeCoin}`;
    const load = () =>
      fetchVaultTrading(vault, activeCoin)
        .then((data) => !cancelled && setTradingState({ key, data }))
        .catch(() => {});
    load();
    const id = window.setInterval(load, TRADING_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [vault, activeCoin]);

  // Draw fills as markers and the position's entry, stop-loss and liquidation as price lines.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const step = INTERVAL_SECONDS[interval];
    markers.current?.setMarkers(
      (trading?.fills ?? []).map((f) => ({
        time: (Math.floor(f.time / step) * step) as UTCTimestamp,
        position: f.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
        shape: f.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
        color: f.side === "buy" ? COLORS.up : COLORS.down,
        text: `${f.side === "buy" ? "B" : "S"} ${f.size}`,
      })),
    );

    for (const line of lines.current) s.removePriceLine(line);
    lines.current = [];
    const p = trading?.position;
    if (p) {
      lines.current.push(
        s.createPriceLine({ price: p.entryPrice, color: COLORS.violet, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Entry" }),
      );
      if (p.liquidationPrice) {
        lines.current.push(
          s.createPriceLine({ price: p.liquidationPrice, color: COLORS.pink, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "Liq." }),
        );
      }
    }
    for (const stop of trading?.stops ?? []) {
      lines.current.push(
        s.createPriceLine({ price: stop.triggerPrice, color: COLORS.down, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "Stop-loss" }),
      );
    }
  }, [trading, interval]);

  const change = last ? ((last.close - last.open) / last.open) * 100 : null;
  const position = trading?.position ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full bg-violet-tint p-1">
          {coins.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCoin(c)}
              className={`rounded-full px-3 py-1 font-mono text-xs transition-all ${
                c === activeCoin ? "bg-white text-violet-ink shadow-sm" : "text-violet/70 hover:text-violet"
              }`}
            >
              {c}-PERP
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] ${live ? "text-green" : "text-violet/50"}`}>
            <span className={`size-1.5 rounded-full ${live ? "animate-pulse bg-green" : "bg-violet/40"}`} />
            {live ? "Live" : "Connecting"}
          </span>
          <div className="flex items-center gap-1 rounded-full bg-violet-tint p-1">
            {CHART_INTERVALS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval_(i)}
                className={`rounded-full px-2.5 py-1 font-mono text-xs transition-all ${
                  i === interval ? "bg-white text-violet-ink shadow-sm" : "text-violet/70 hover:text-violet"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-violet-line/70 bg-violet-tint/60 px-4 py-3 text-sm sm:grid-cols-4">
        <Stat label="Last price" value={last ? price(last.close) : "–"}>
          {change !== null && (
            <span className={change >= 0 ? "text-green" : "text-orange"}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          )}
        </Stat>
        <Stat
          label="Position"
          value={position ? `${position.size > 0 ? "Long" : "Short"} ${Math.abs(position.size)}` : vault ? "Flat" : "–"}
        >
          {position?.leverage ? <span className="text-violet/60">{position.leverage}×</span> : null}
        </Stat>
        <Stat label="Unrealised PnL" value={position ? `${position.unrealizedPnl >= 0 ? "+" : ""}${usd(position.unrealizedPnl)}` : "–"} tone={position ? (position.unrealizedPnl >= 0 ? "text-green" : "text-orange") : undefined} />
        <Stat label="Vault value" value={trading?.accountValue != null ? `${usd(trading.accountValue)} USDC` : "–"} />
      </dl>

      {/* Chart */}
      <div className="relative min-h-[22rem] flex-1 overflow-hidden rounded-xl border border-violet-line/70">
        <div ref={container} className="absolute inset-0" />
        {error && (
          <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-orange-soft px-3 py-2 text-sm text-orange">
            {error}
          </p>
        )}
      </div>

      {/* Legend and state */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-violet/70">
        <span className="flex flex-wrap items-center gap-4">
          <Legend color="bg-green" label="Agent buy" />
          <Legend color="bg-orange" label="Agent sell" />
          <Legend color="bg-violet" label="Entry" dashed />
          <Legend color="bg-orange" label="Stop-loss" />
        </span>
        <span>
          {!address
            ? "Connect your wallet to see your Vault's trades on the chart."
            : !vault
              ? "No Vault yet. Create one and its trades will appear here."
              : `Vault ${vault.slice(0, 6)}…${vault.slice(-4)} · ${trading?.fills.length ?? 0} ${activeCoin} fills · Hyperliquid testnet`}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, children }: { label: string; value: string; tone?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-violet/60">{label}</dt>
      <dd className={`flex items-baseline gap-2 truncate tabular-nums text-violet-ink ${tone ?? ""}`}>
        <span className="text-base">{value}</span>
        {children && <span className="text-xs">{children}</span>}
      </dd>
    </div>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-[3px] w-4 rounded-full ${color} ${dashed ? "[mask-image:repeating-linear-gradient(90deg,#000_0_4px,transparent_4px_6px)]" : ""}`} />
      {label}
    </span>
  );
}
