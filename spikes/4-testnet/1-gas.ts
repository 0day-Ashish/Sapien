// Step 1 (only if the owner has no HYPE on HyperEVM): buy a little HYPE on testnet spot and send it to HyperEVM
// through the HYPE system address. Gas for a deploy plus a handful of calls is tiny.
import { formatEther } from "viem";
import { evm, exchange, info, owner, px, record, sleep, sz } from "./lib.ts";

const HYPE_SYSTEM = "0x2222222222222222222222222222222222222222";
const o = owner();
const ex = exchange(o);

const spot = await info.spotMeta();
const hype = spot.tokens.find((t) => t.name === "HYPE")!;
const usdc = spot.tokens.find((t) => t.name === "USDC")!;
const pair = spot.universe.find((p) => p.tokens[0] === hype.index && p.tokens[1] === usdc.index)!;
const mids = await info.allMids();
const mid = Number(mids[pair.name]);
// Spot minimum order value is $10. Testnet HYPE trades far from mainnet (~1,100 USDC), so size by value, rounded up.
const step = 10 ** -hype.szDecimals;
const amount = Math.ceil(11 / mid / step) * step;

const spotBal = await info.spotClearinghouseState({ user: o.address });
const spotUsdc = Number(spotBal.balances.find((b) => b.coin === "USDC")?.total ?? 0);
if (spotUsdc < amount * mid * 1.1) {
  console.log("Moving 15 USDC perp -> spot for the HYPE buy");
  await ex.usdClassTransfer({ amount: "15", toPerp: false });
}

const held = Number((await info.spotClearinghouseState({ user: o.address })).balances.find((b) => b.coin === "HYPE")?.total ?? 0);
if (held * mid < 5) {
const buy = await ex.order({
  orders: [{ a: 10000 + pair.index, b: true, p: px(mid * 1.05, hype.szDecimals, "spot"), s: sz(amount, hype.szDecimals), r: false, t: { limit: { tif: "Ioc" } } }],
  grouping: "na",
});
record("1.hypeBuy", buy.response.data.statuses);
await sleep(1500);
}

const after = await info.spotClearinghouseState({ user: o.address });
const got = after.balances.find((b) => b.coin === "HYPE")?.total ?? "0";
// Round down: trading fees leave slightly less than the order size.
const send = (Math.floor(Number(got) * 0.99 * 1e6) / 1e6).toFixed(6);
await ex.spotSend({ destination: HYPE_SYSTEM, token: `HYPE:${hype.tokenId}`, amount: send });
console.log(`Sent ${send} HYPE to HyperEVM, waiting for it to land...`);
for (let i = 0; i < 20; i++) {
  const bal = await evm.getBalance({ address: o.address });
  if (bal > 0n) {
    record("1.hypeOnEvm", formatEther(bal));
    process.exit(0);
  }
  await sleep(3000);
}
console.log("HYPE has not landed on HyperEVM yet; check again with npm run setup.");
