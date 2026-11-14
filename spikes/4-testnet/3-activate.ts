// Step 3: make the contract its own HyperCore account, then prove CoreWriter can move its USDC between spot and perp.
// Primitive 1 of #4: activation fee, how funds arrive, and the units CoreWriter's usdClassTransfer uses.
import { attempt, contract, coreAction, exchange, info, owner, record, snapshot, viaCoreWriter, waitFor } from "./lib.ts";

const c = contract();
const o = owner();
const amount = process.env.ACTIVATE_USDC ?? "30";

record("3a.preTransferCheck", await info.preTransferCheck({ user: c, source: o.address }));
record("3a.contractBefore", await snapshot(c));

const ownerBefore = await info.clearinghouseState({ user: o.address });
await attempt("3b.usdSendToContract", () => exchange(o).usdSend({ destination: c, amount }));

const landed = await waitFor("contract account to show USDC", async () => {
  const s = await snapshot(c);
  const total = Number(s.perpAccountValue) + s.spot.reduce((n, b) => n + (b.coin === "USDC" ? Number(b.total) : 0), 0);
  return total > 0 ? s : undefined;
});
const ownerAfter = await info.clearinghouseState({ user: o.address });
record("3b.contractAfterSend", landed);
record("3b.ownerPerpDelta", Number(ownerAfter.marginSummary.accountValue) - Number(ownerBefore.marginSummary.accountValue));
record("3b.preTransferCheckAfter", await info.preTransferCheck({ user: c, source: o.address }));

// CoreWriter action 7 (usdClassTransfer). Units are not documented: send 1_000_000 raw and see what moves.
const before = await snapshot(c);
await viaCoreWriter("perp->spot 1e6 raw", coreAction(7, [{ type: "uint64" }, { type: "bool" }], [1_000_000n, false]));
const moved = await waitFor("spot USDC to change", async () => {
  const s = await snapshot(c);
  return JSON.stringify(s.spot) !== JSON.stringify(before.spot) ? s : undefined;
}, 30_000);
record("3c.coreWriterUsdClassTransfer", { before: { perp: before.perpAccountValue, spot: before.spot }, after: moved ? { perp: moved.perpAccountValue, spot: moved.spot } : "no change within 30s (unified account, wrong units, or silently dropped)" });

if (moved) {
  await viaCoreWriter("spot->perp same amount back", coreAction(7, [{ type: "uint64" }, { type: "bool" }], [1_000_000n, true]));
}
console.log(`\nContract on the explorer: https://app.hyperliquid-testnet.xyz/explorer/address/${c}`);
