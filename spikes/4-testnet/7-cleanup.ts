// Step 7: flatten the contract and send its USDC back to the owner through CoreWriter action 13 (send asset).
// Also shows that the contract itself, not the agent, can move funds out: the basis of the Vault withdrawal path.
import { contract, coreAction, flatten, info, owner, record, sleep, snapshot, viaCoreWriter, waitFor } from "./lib.ts";

const c = contract();
const s = await snapshot(c);
// Testnet books can sit outside the ~2.5% oracle band, so an IOC close may be rejected. If a reduce-only
// close is already resting for every open position, leave it; otherwise flatten.
const covered = s.positions.every((p) => s.openOrders.some((o) => o.coin === p.coin && o.reduceOnly && !o.isTrigger));
if (!covered) await flatten(c).catch((e) => console.log("  flatten failed:", e.message));
await sleep(1000);

const flat = await snapshot(c);
const ownerBefore = await info.clearinghouseState({ user: owner().address });
// Keep 1 USDC so the account stays activated (withdrawable already excludes margin held by open positions).
// Action 13 takes USDC in 8-decimal wei even on the perp dex, but perp balances have 6-decimal precision:
// an amount that is not a multiple of 100 wei is dropped silently. So round to 6 decimals, then scale.
const keep = 1;
const send = BigInt(Math.floor((Number(flat.withdrawable) - keep) * 1e6)) * 100n;
if (send > 0n) {
  // destination, subAccount (0 = own account), source dex, destination dex (0 = default perp dex), token 0 = USDC, amount.
  await viaCoreWriter(
    `sendAsset ${send} wei (${Number(send) / 1e8} USDC) perp -> owner perp`,
    coreAction(
      13,
      [{ type: "address" }, { type: "address" }, { type: "uint32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint64" }],
      [owner().address, "0x0000000000000000000000000000000000000000", 0, 0, 0n, send],
    ),
  );
  const ownerAfter = await waitFor("owner balance to rise", async () => {
    const st = await info.clearinghouseState({ user: owner().address });
    return Number(st.marginSummary.accountValue) > Number(ownerBefore.marginSummary.accountValue) + 0.5 ? st : undefined;
  }, 30_000);
  record("7.coreWriterSendAssetToOwner", {
    weiSent: send.toString(),
    ownerDelta: ownerAfter ? Number(ownerAfter.marginSummary.accountValue) - Number(ownerBefore.marginSummary.accountValue) : "no change within 30s",
    contractAfter: await snapshot(c),
  });
}
