// Step 5: the Agent Wallet trades for the contract's account with grouped reduce-only stop-losses.
// Primitive 3 of #4: normalTpsl vs positionTpsl, and how each behaves on fill, cancel and close.
// The agent signs; the orders land on the contract's account because the contract registered the agent.
import { agent, attempt, contract, exchange, info, perp, px, record, sleep, snapshot, sz } from "./lib.ts";

const c = contract();
const ex = exchange(agent());
const COIN = process.env.SPIKE_COIN ?? "ETH";
const m = await perp(COIN);
const a = m.index;
console.log(`${COIN}: asset ${a}, mark ${m.mark}, szDecimals ${m.szDecimals}`);

const notional = (usd: number) => sz(usd / m.mark, m.szDecimals);
const stopFor = (size: string, trigger: number) => ({
  a, b: false, p: px(trigger * 0.9, m.szDecimals), s: size, r: true,
  t: { trigger: { isMarket: true, triggerPx: px(trigger, m.szDecimals), tpsl: "sl" as const } },
});
const position = async () =>
  (await info.clearinghouseState({ user: c })).assetPositions.find((p) => p.position.coin === COIN)?.position.szi ?? "0";

// A. Leverage is a separate action. Can the Agent Wallet set it?
await attempt("5a.agentUpdateLeverage", () => ex.updateLeverage({ asset: a, isCross: true, leverage: 3 }));

// B. normalTpsl with a parent that rests unfilled, then the parent is cancelled.
const restSize = notional(14);
const b = await attempt("5b.normalTpsl.restingParent", () =>
  ex.order({
    orders: [{ a, b: true, p: px(m.mark * 0.9, m.szDecimals), s: restSize, r: false, t: { limit: { tif: "Gtc" } } }, stopFor(restSize, m.mark * 0.85)],
    grouping: "normalTpsl",
  }),
);
await sleep(1500);
record("5b.openOrdersWhileParentRests", (await snapshot(c)).openOrders);
const restingOid = b.ok ? (b.result as any).response.data.statuses[0]?.resting?.oid : undefined;
if (restingOid) {
  await attempt("5b.cancelParent", () => ex.cancel({ cancels: [{ a, o: restingOid }] }));
  await sleep(1500);
  record("5b.openOrdersAfterParentCancel", (await snapshot(c)).openOrders);
}

// C. normalTpsl with a parent that fills immediately (marketable IOC).
const fillSize = notional(14);
await attempt("5c.normalTpsl.filledParent", () =>
  ex.order({
    orders: [{ a, b: true, p: px(m.mark * 1.01, m.szDecimals), s: fillSize, r: false, t: { limit: { tif: "Ioc" } } }, stopFor(fillSize, m.mark * 0.95)],
    grouping: "normalTpsl",
  }),
);
await sleep(1500);
const afterFill = await snapshot(c);
record("5c.stateAfterFill", { positions: afterFill.positions, openOrders: afterFill.openOrders });
const stop = afterFill.openOrders.find((o) => o.isTrigger && o.reduceOnly);
if (stop) record("5c.stopOrderStatus", await info.orderStatus({ user: c, oid: stop.oid }));

// D. positionTpsl on the open position, then grow the position: which stop resizes?
const pos1 = await position();
await attempt("5d.positionTpsl", () => ex.order({ orders: [stopFor(sz(Math.abs(Number(pos1)), m.szDecimals), m.mark * 0.93)], grouping: "positionTpsl" }));
await sleep(1500);
await attempt("5d.addToPosition", () =>
  ex.order({ orders: [{ a, b: true, p: px(m.mark * 1.01, m.szDecimals), s: notional(11), r: false, t: { limit: { tif: "Ioc" } } }], grouping: "na" }),
);
await sleep(1500);
const grown = await snapshot(c);
record("5d.stopsAfterPositionGrew", { position: await position(), stops: grown.openOrders.filter((o) => o.isTrigger) });

// E. Close the whole position with a reduce-only IOC: do the stops cancel themselves?
const pos2 = Math.abs(Number(await position()));
if (pos2 > 0) {
  await attempt("5e.closePosition", () =>
    ex.order({ orders: [{ a, b: false, p: px(m.mark * 0.98, m.szDecimals), s: sz(pos2, m.szDecimals), r: true, t: { limit: { tif: "Ioc" } } }], grouping: "na" }),
  );
  await sleep(2000);
  const closed = await snapshot(c);
  record("5e.afterClose", { positions: closed.positions, openOrders: closed.openOrders });
}
console.log(`\nOrders on the explorer: https://app.hyperliquid-testnet.xyz/explorer/address/${c}`);
