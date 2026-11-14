// #16: produce a real Overshoot on testnet. A victim account opens a small position with a grouped reduce-only stop;
// a separate pusher account rests an order inside the book's gap, as far toward the stop as the oracle band allows,
// which drags Hyperliquid's mark price (a median that includes best bid / best ask / last trade) through the trigger.
// The stop-market then fills into the gapped book, past its trigger. The script records the evidence an Overshoot
// claim needs (#15): stop order id, trigger price, fill price, size, and timestamps.
//
// Pick a market with `npx tsx scripts/overshoot-scout.ts 0.5` (a gap past the trigger, push ~0).
//   engine/.env.local: OVERSHOOT_VICTIM_PRIVATE_KEY, OVERSHOOT_PUSHER_PRIVATE_KEY (both funded on testnet HyperCore perp)
//   npx tsx scripts/demo-overshoot.ts <COIN> [long|short] [stopPct=0.5] [sizeUsd=12]
//
// The victim here is a plain testnet account so the mechanics can be proven before a Mandate allows a thin market.
// For the demo, the victim is a Vault trading through the engine, with the same stop the engine places.

import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = new URL("..", import.meta.url).pathname;
process.loadEnvFile(`${root}.env.local`);
const [coin = "XTEN", sideArg = "long", stopPctArg = "0.5", sizeArg = "12"] = process.argv.slice(2);
const side = sideArg as "long" | "short";
const stopPct = Number(stopPctArg) / 100;
const sizeUsd = Number(sizeArg);
const BAND = 0.024; // stay just inside the ~2.5% oracle band (#4)
const STOP_SLIPPAGE = 0.1; // Hyperliquid's own market TP/SL slippage

const transport = new HttpTransport({ isTestnet: true });
const info = new InfoClient({ transport });
const victim = privateKeyToAccount(process.env.OVERSHOOT_VICTIM_PRIVATE_KEY as Hex);
const pusher = privateKeyToAccount(process.env.OVERSHOOT_PUSHER_PRIVATE_KEY as Hex);
const vx = new ExchangeClient({ transport, wallet: victim });
const px = new ExchangeClient({ transport, wallet: pusher });
const cloid = (): Hex => `0x${randomBytes(16).toString("hex")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string, data?: unknown) => console.log(`${new Date().toISOString()} ${msg}`, data === undefined ? "" : JSON.stringify(data));

const meta = await info.meta();
const a = meta.universe.findIndex((u) => u.name === coin);
if (a < 0) throw new Error(`Unknown perp ${coin}`);
const szDec = meta.universe[a]!.szDecimals;
const prices = async () => {
  const [, ctxs] = await info.metaAndAssetCtxs();
  const book = await info.l2Book({ coin });
  return { mark: Number(ctxs[a]!.markPx), oracle: Number(ctxs[a]!.oraclePx), bid: Number(book!.levels[0][0]?.px ?? 0), ask: Number(book!.levels[1][0]?.px ?? 0) };
};

// 1. Victim opens with a grouped reduce-only stop-market, as the engine does (normalTpsl, #4).
const p0 = await prices();
log("market", p0);
const long = side === "long";
const entryLimit = long ? Math.min(p0.ask * 1.002, p0.oracle * (1 + BAND)) : Math.max(p0.bid * 0.998, p0.oracle * (1 - BAND));
const size = formatSize(sizeUsd / p0.mark, szDec);
const trigger = long ? p0.mark * (1 - stopPct) : p0.mark * (1 + stopPct);
const stopCloid = cloid();
const opened = await vx.order({
  orders: [
    { a, b: long, p: formatPrice(entryLimit, szDec), s: size, r: false, t: { limit: { tif: "Ioc" } } },
    { a, b: !long, p: formatPrice(trigger * (long ? 1 - STOP_SLIPPAGE : 1 + STOP_SLIPPAGE), szDec), s: size, r: true, t: { trigger: { isMarket: true, triggerPx: formatPrice(trigger, szDec), tpsl: "sl" } }, c: stopCloid },
  ],
  grouping: "normalTpsl",
});
log("victim entry", opened.response.data.statuses);
const pos = (await info.clearinghouseState({ user: victim.address })).assetPositions.find((p) => p.position.coin === coin);
if (!pos) throw new Error("Entry didn't fill; nothing to stop out. Try a market with a closer touch or a larger IOC limit.");
log("victim position", { szi: pos.position.szi, entryPx: pos.position.entryPx, trigger, stopCloid });

// 2. Pusher rests an order in the gap: toward the trigger, inside the oracle band, just beyond the far side's touch.
const pushPx = long ? Math.max(p0.oracle * (1 - BAND), p0.bid * 1.001) : Math.min(p0.oracle * (1 + BAND), p0.ask * 0.999);
const pushCloid = cloid();
const pushed = await px.order({
  orders: [{ a, b: !long, p: formatPrice(pushPx, szDec), s: formatSize(Math.max(11 / pushPx, sizeUsd / pushPx), szDec), r: false, t: { limit: { tif: "Alo" } }, c: pushCloid }],
  grouping: "na",
});
log("pusher resting order", { px: pushPx, statuses: pushed.response.data.statuses });

// 3. Watch the mark until it crosses the trigger and the stop fills (or 6 minutes pass).
const started = Date.now();
let stopState = "open";
while (Date.now() - started < 6 * 60_000) {
  await sleep(3_000);
  const p = await prices();
  const st = await info.orderStatus({ user: victim.address, oid: stopCloid });
  stopState = st.status === "order" ? st.order.status : st.status;
  log("watch", { ...p, trigger, stop: stopState });
  if (stopState !== "open") break;
}

// 4. Evidence: the stop's fill(s) versus its trigger.
const fills = (await info.userFills({ user: victim.address })).filter((f) => f.coin === coin && f.time >= started - 60_000);
const stopFills = fills.filter((f) => f.dir?.includes("Close") || f.side === (long ? "A" : "B"));
const filledSz = stopFills.reduce((s, f) => s + Number(f.sz), 0);
const avgFill = filledSz > 0 ? stopFills.reduce((s, f) => s + Number(f.px) * Number(f.sz), 0) / filledSz : null;
const overshootUsd = avgFill === null ? 0 : Math.abs(avgFill - trigger) * filledSz;
const evidence = {
  at: new Date().toISOString(),
  coin,
  side,
  stopPct: stopPct * 100,
  trigger,
  stopCloid,
  stopState,
  filledSize: filledSz,
  avgFillPrice: avgFill,
  overshootPct: avgFill === null ? null : (Math.abs(avgFill - trigger) / trigger) * 100,
  overshootUsd,
  fills: stopFills.map((f) => ({ oid: f.oid, px: f.px, sz: f.sz, time: f.time, hash: f.hash })),
  explorer: `https://app.hyperliquid-testnet.xyz/explorer/address/${victim.address}`,
};
log("EVIDENCE", evidence);
mkdirSync(`${root}.data`, { recursive: true });
appendFileSync(`${root}.data/overshoots.jsonl`, `${JSON.stringify(evidence)}\n`);

// 5. Clean up: cancel the pusher's order; close anything left on either side.
await px.cancelByCloid({ cancels: [{ asset: a, cloid: pushCloid }] }).catch(() => undefined);
for (const [who, ex] of [[victim, vx], [pusher, px]] as const) {
  const left = (await info.clearinghouseState({ user: who.address })).assetPositions.find((p) => p.position.coin === coin);
  if (!left) continue;
  const s = Number(left.position.szi);
  const p = await prices();
  const lim = s > 0 ? Math.max(p.bid * 0.99, p.oracle * (1 - BAND)) : Math.min(p.ask * 1.01, p.oracle * (1 + BAND));
  await ex.order({ orders: [{ a, b: s < 0, p: formatPrice(lim, szDec), s: formatSize(Math.abs(s), szDec), r: true, t: { limit: { tif: "Gtc" } } }], grouping: "na" }).catch((e) => log("close failed", String(e)));
  log(`left a reduce-only close for ${who.address === victim.address ? "victim" : "pusher"}`, { szi: s });
}
