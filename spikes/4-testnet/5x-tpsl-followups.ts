// Step 5x: follow-ups that decide how the engine tracks stop-losses (#8).
// 1. A cloid on the stop-loss child, so the engine can find the stop without its oid (the order response omits it).
// 2. positionTpsl with size "0": does it then cover the whole position as it grows?
// 3. A partially filled IOC entry with normalTpsl: is the stop placed, and at what size?
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { agent, attempt, contract, exchange, flatten, info, perp, px, record, sleep, snapshot, sz } from "./lib.ts";

const c = contract();
const ex = exchange(agent());
const cloid = (): Hex => `0x${randomBytes(16).toString("hex")}`;
const stop = (a: number, szDec: number, size: string, trigger: number, c?: Hex) => ({
  a, b: false, p: px(trigger * 0.9, szDec), s: size, r: true,
  t: { trigger: { isMarket: true, triggerPx: px(trigger, szDec), tpsl: "sl" as const } },
  ...(c ? { c } : {}),
});
const stopsOf = async () => (await snapshot(c)).openOrders.filter((o) => o.isTrigger).map((o) => ({ oid: o.oid, sz: o.sz, triggerPx: o.triggerPx, isPositionTpsl: o.isPositionTpsl }));

// 1. cloid on the child stop
const eth = await perp("ETH");
const entryCloid = cloid();
const stopCloid = cloid();
const size1 = sz(12 / eth.mark, eth.szDecimals);
await attempt("5x1.entryWithCloids", () =>
  ex.order({
    orders: [
      { a: eth.index, b: true, p: px(eth.mark * 1.01, eth.szDecimals), s: size1, r: false, t: { limit: { tif: "Ioc" } }, c: entryCloid },
      stop(eth.index, eth.szDecimals, size1, eth.mark * 0.95, stopCloid),
    ],
    grouping: "normalTpsl",
  }),
);
await sleep(1500);
record("5x1.stopStatusByCloid", await info.orderStatus({ user: c, oid: stopCloid }));

// 2. positionTpsl with size "0", then grow the position
await attempt("5x2.positionTpslSizeZero", () => ex.order({ orders: [stop(eth.index, eth.szDecimals, "0", eth.mark * 0.92)], grouping: "positionTpsl" }));
await sleep(1500);
const beforeGrow = await stopsOf();
await ex.order({ orders: [{ a: eth.index, b: true, p: px(eth.mark * 1.01, eth.szDecimals), s: sz(11 / eth.mark, eth.szDecimals), r: false, t: { limit: { tif: "Ioc" } } }], grouping: "na" });
await sleep(1500);
const pos = (await snapshot(c)).positions.find((p) => p.coin === "ETH")?.szi;
record("5x2.positionTpslZeroAfterGrow", { position: pos, stopsBeforeGrow: beforeGrow, stopsAfterGrow: await stopsOf() });

await flatten(c);

// 3. Partial fill: an IOC limited to the best ask, sized past it, so only part fills.
const btc = await perp("BTC");
const book = await info.l2Book({ coin: "BTC" });
const best = book!.levels[1][0]!;
const want = Math.max(Number(best.sz) * 1.5, 11 / Number(best.px));
const size3 = sz(Math.ceil(want * 10 ** btc.szDecimals) / 10 ** btc.szDecimals, btc.szDecimals);
const r3 = await attempt("5x3.partialFillEntry", () =>
  ex.order({
    orders: [
      { a: btc.index, b: true, p: best.px, s: size3, r: false, t: { limit: { tif: "Ioc" } } },
      stop(btc.index, btc.szDecimals, size3, Number(best.px) * 0.95),
    ],
    grouping: "normalTpsl",
  }),
);
await sleep(2000);
const s3 = await snapshot(c);
record("5x3.afterPartialFill", {
  bestAskAtSend: best,
  orderedSize: size3,
  statuses: r3.ok ? (r3.result as any).response.data.statuses : r3.error,
  position: s3.positions,
  stops: s3.openOrders.filter((o) => o.isTrigger),
});

const end = await flatten(c);
record("5x.flatAfterFollowups", { positions: end.positions, openOrders: end.openOrders.length, perp: end.perpAccountValue });
