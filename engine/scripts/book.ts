// Prints the top of the book, mark, oracle and the ~2.4% oracle band for some perps (read-only).
//   npx tsx scripts/book.ts XTEN MERL WIF
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const info = new InfoClient({ transport: new HttpTransport({ isTestnet: true }) });
const [meta, ctxs] = await info.metaAndAssetCtxs();
for (const coin of process.argv.slice(2)) {
  const i = meta.universe.findIndex((u) => u.name === coin);
  const c = ctxs[i]!;
  const b = await info.l2Book({ coin });
  const oracle = Number(c.oraclePx);
  const lv = (side: 0 | 1) =>
    b!.levels[side]
      .slice(0, 4)
      .map((l) => `${l.px} x ${l.sz} (${(Number(l.px) * Number(l.sz)).toFixed(0)} USD)`)
      .join(" | ");
  console.log(`${coin}: mark ${c.markPx}, oracle ${c.oraclePx}, band ${(oracle * 0.976).toPrecision(5)}..${(oracle * 1.024).toPrecision(5)}, szDecimals ${meta.universe[i]!.szDecimals}, maxLev ${meta.universe[i]!.maxLeverage}`);
  console.log(`  bids: ${lv(0)}`);
  console.log(`  asks: ${lv(1)}`);
}
