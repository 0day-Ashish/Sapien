// Step 7: flatten the contract and send its USDC back to the owner through CoreWriter action 13 (send asset).
// Also shows that the contract itself, not the agent, can move funds out: the basis of the Vault withdrawal path.
import { agent, contract, coreAction, exchange, info, owner, perp, px, record, sleep, snapshot, sz, viaCoreWriter, waitFor } from "./lib.ts";

const c = contract();
const ex = exchange(agent());
const s = await snapshot(c);

if (s.openOrders.length) {
  const meta = await info.meta();
  const idx = (coin: string) => meta.universe.findIndex((u) => u.name === coin);
  await ex.cancel({ cancels: s.openOrders.map((o) => ({ a: idx(o.coin), o: o.oid })) });
}
for (const p of s.positions) {
  const m = await perp(p.coin);
  const size = Number(p.szi);
  await ex.order({
    orders: [{ a: m.index, b: size < 0, p: px(m.mark * (size < 0 ? 1.02 : 0.98), m.szDecimals), s: sz(Math.abs(size), m.szDecimals), r: true, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
  });
}
await sleep(2000);

const flat = await snapshot(c);
const ownerBefore = await info.clearinghouseState({ user: owner().address });
// Keep 1 USDC so the account stays activated. Units guessed as 1e6 per USDC for the perp dex (checked by the delta below).
const keep = 1;
const send = Math.floor((Number(flat.withdrawable) - keep) * 1e6);
if (send > 0) {
  // destination, subAccount (0 = own account), source dex, destination dex (0 = default perp dex), token 0 = USDC, amount.
  await viaCoreWriter(
    `sendAsset ${send} raw USDC perp -> owner perp`,
    coreAction(
      13,
      [{ type: "address" }, { type: "address" }, { type: "uint32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint64" }],
      [owner().address, "0x0000000000000000000000000000000000000000", 0, 0, 0n, BigInt(send)],
    ),
  );
  const ownerAfter = await waitFor("owner balance to rise", async () => {
    const st = await info.clearinghouseState({ user: owner().address });
    return Number(st.marginSummary.accountValue) > Number(ownerBefore.marginSummary.accountValue) + 0.5 ? st : undefined;
  }, 30_000);
  record("7.coreWriterSendAssetToOwner", {
    rawSent: send,
    ownerDelta: ownerAfter ? Number(ownerAfter.marginSummary.accountValue) - Number(ownerBefore.marginSummary.accountValue) : "no change within 30s",
    contractAfter: await snapshot(c),
  });
}
