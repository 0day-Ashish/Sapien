// #16, step 1 (read-only): which thin testnet perp can a second account push through our own stop-loss, for a real
// Overshoot? For each market and side, estimates the notional a pusher must sweep to drag the book from the touch to
// the stop trigger, whether the trigger is inside the ~2.5% oracle band (orders priced outside it are rejected, #4),
// and the Overshoot our stop-market would see filling into what's left of the book.
//   npx tsx scripts/overshoot-scout.ts [stopPct=2] [stopNotionalUsd=12]
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const stopPct = Number(process.argv[2] ?? 2) / 100;
const stopUsd = Number(process.argv[3] ?? 12);
const maxPushUsd = Number(process.argv[4] ?? 400);
const BAND = 0.025;
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: true }) });

const [meta, ctxs] = await info.metaAndAssetCtxs();
const candidates = meta.universe
  .map((u, i) => ({ name: u.name, maxLev: u.maxLeverage, isDelisted: u.isDelisted, ctx: ctxs[i]! }))
  .filter((m) => !m.isDelisted && Number(m.ctx.dayNtlVlm) < 5_000 && Number(m.ctx.markPx) > 0);

type Row = {
  coin: string;
  side: "long" | "short";
  mark: number;
  markVsOracle: string;
  trigger: number;
  inBand: boolean;
  pushUsd: number;
  overshootPct: number | null;
  maxLev: number;
  vol24h: number;
};
const rows: Row[] = [];

for (const m of candidates) {
  const book = await info.l2Book({ coin: m.name }).catch(() => null);
  if (!book) continue;
  const mark = Number(m.ctx.markPx);
  const oracle = Number(m.ctx.oraclePx);
  for (const side of ["long", "short"] as const) {
    // A long's stop sells into bids below the trigger; the pusher sells the bids above it first.
    const levels = (side === "long" ? book.levels[0] : book.levels[1]).map((l) => ({ px: Number(l.px), sz: Number(l.sz) }));
    const trigger = side === "long" ? mark * (1 - stopPct) : mark * (1 + stopPct);
    const beyond = (px: number) => (side === "long" ? px < trigger : px > trigger);
    const pushUsd = levels.filter((l) => !beyond(l.px)).reduce((a, l) => a + l.px * l.sz, 0);

    // The stop-market then fills into the remaining book.
    let need = stopUsd / mark;
    let cost = 0;
    let filled = 0;
    for (const l of levels.filter((x) => beyond(x.px))) {
      const take = Math.min(need, l.sz);
      cost += take * l.px;
      filled += take;
      need -= take;
      if (need <= 0) break;
    }
    const overshootPct = filled === 0 || need > 1e-12 ? null : (Math.abs(cost / filled - trigger) / trigger) * 100;
    const inBand = side === "long" ? trigger >= oracle * (1 - BAND) : trigger <= oracle * (1 + BAND);
    rows.push({
      coin: m.name,
      side,
      mark,
      markVsOracle: `${((mark / oracle - 1) * 100).toFixed(2)}%`,
      trigger: Number(trigger.toPrecision(5)),
      inBand,
      pushUsd: Math.round(pushUsd),
      overshootPct: overshootPct === null ? null : Number(overshootPct.toFixed(2)),
      maxLev: m.maxLev,
      vol24h: Math.round(Number(m.ctx.dayNtlVlm)),
    });
  }
}

const usable = rows
  .filter((r) => r.inBand && r.overshootPct !== null && r.pushUsd < maxPushUsd)
  .sort((a, b) => a.pushUsd - b.pushUsd || (b.overshootPct ?? 0) - (a.overshootPct ?? 0));
console.log(`Scanned ${candidates.length} thin perps (under 5k USD/24h). Stop ${stopPct * 100}%, stop size ${stopUsd} USD.`);
console.log(`\nUsable (trigger inside the oracle band, push under ${maxPushUsd} USD, book deep enough to fill the stop): ${usable.length}`);
console.table(usable.slice(0, 15));
console.log(`\n${rows.filter((r) => !r.inBand).length} of ${rows.length} market-sides have the trigger outside the oracle band.`);
console.log(`${rows.filter((r) => r.inBand && r.overshootPct === null).length} in-band market-sides have too little book past the trigger to fill the stop.`);
