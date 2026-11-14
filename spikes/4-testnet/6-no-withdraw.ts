// Step 6: the Agent Wallet tries every way it might move the contract's money out. All should fail.
// Primitive 4 of #4. Balances are compared before and after so a "success" that moved nothing is visible too.
import { agent, attempt, contract, exchange, record, snapshot, USDC_TOKEN } from "./lib.ts";

const c = contract();
const ag = agent();
const ex = exchange(ag);
const before = await snapshot(c);

await attempt("6a.withdraw3ToAgent", () => ex.withdraw3({ destination: ag.address, amount: "2" }));
await attempt("6b.usdSendToAgent", () => ex.usdSend({ destination: ag.address, amount: "1" }));
await attempt("6c.spotSendToAgent", () => ex.spotSend({ destination: ag.address, token: USDC_TOKEN, amount: "1" }));
await attempt("6d.agentSendAssetToAgent", () =>
  ex.agentSendAsset({ destination: ag.address, sourceDex: "", destinationDex: "spot", token: USDC_TOKEN, amount: "1" }),
);
// Moving within the contract's own account is the one transfer an agent is documented to sign.
await attempt("6e.agentSendAssetToSelf", () =>
  ex.agentSendAsset({ destination: c, sourceDex: "", destinationDex: "spot", token: USDC_TOKEN, amount: "1" }),
);
// Could an agent register a second agent (a key it controls) for the contract?
await attempt("6f.agentApprovesAnotherAgent", () => ex.approveAgent({ agentAddress: ag.address, agentName: "sneaky" }));

const after = await snapshot(c);
record("6g.contractBalancesBeforeAfter", {
  before: { perp: before.perpAccountValue, spot: before.spot },
  after: { perp: after.perpAccountValue, spot: after.spot },
});
record("6h.agentOwnAccount", await snapshot(ag.address));
