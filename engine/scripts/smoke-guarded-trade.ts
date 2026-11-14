// Testnet smoke for #8: one real guarded trade through handle(event) with the Hyperliquid adapter.
// The chain side is a local stand-in until the Vault and DecisionLog contracts exist (#5, #8): it records the
// commitment instead of sending it, and says so in the output. Manual, not in CI.
//
//   VAULT_ADDRESS, AGENT_PRIVATE_KEY in engine/.env.local
//   npm run smoke:trade -- [--close]     open (and optionally close) one guarded trade
//   npm run smoke:trade -- --close-only  only close the Vault's open position in SMOKE_ASSET

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { HyperliquidExchange } from "../src/adapters/hyperliquid.js";
import { createEngine, type TradeProposal } from "../src/index.js";
import { FakeChain } from "../src/testing/fakes.js";

const envFile = new URL("../.env.local", import.meta.url).pathname;
if (existsSync(envFile)) process.loadEnvFile(envFile);
const vaultId = process.env.VAULT_ADDRESS;
const agentKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!vaultId || !agentKey) throw new Error("Set VAULT_ADDRESS and AGENT_PRIVATE_KEY in engine/.env.local");

const exchange = new HyperliquidExchange({ isTestnet: true, agentFor: () => privateKeyToAccount(agentKey) });
const chain = new FakeChain(); // stand-in until #5: records commitments locally
const engine = createEngine({ exchange, chain });

const asset = process.env.SMOKE_ASSET ?? "ETH";
const mark = await exchange.markPrice(asset);
const base = { type: "trade-proposal", vaultId, agentId: "momentum", asset, confidence: 0.72 } as const;

const show = (label: string, v: unknown) => console.log(`\n${label}\n${JSON.stringify(v, null, 2)}`);

const closeOnly = process.argv.includes("--close-only");

if (!closeOnly) {
// 1. Over the leverage cap (default Mandate cap is 3x): rejected, nothing sent.
show(
  "1. Proposal over the leverage cap",
  await engine.handle({ ...base, proposalId: randomUUID(), side: "long", size: 12 / mark, leverage: 5, intent: "open", rationale: "breakout, sized aggressively" } satisfies TradeProposal),
);

// 2. Re-planned inside the cap: committed, then entry plus grouped stop-loss on testnet.
const opened = await engine.handle({ ...base, proposalId: randomUUID(), side: "long", size: 12 / mark, leverage: 2, intent: "open", rationale: "breakout above the 4h range, re-planned at 2x" } satisfies TradeProposal);
show("2. Re-planned proposal", opened);

if (opened.kind === "executed" && opened.stopLoss) {
  await new Promise((r) => setTimeout(r, 2000));
  show("Stop-loss on HyperCore (by cloid)", { cloid: opened.stopLoss.cloid, state: await exchange.orderStatus(vaultId, opened.stopLoss.cloid) });
  show("Vault positions", await exchange.positions(vaultId));
  console.log(`\nCommitment recorded locally (chain stand-in, not onchain yet): ${opened.decisionHash}`);
  console.log(`Explorer: https://app.hyperliquid-testnet.xyz/explorer/address/${vaultId}`);
}

}

if (closeOnly || process.argv.includes("--close")) {
  const pos = (await exchange.positions(vaultId)).find((p) => p.asset === asset);
  if (pos && pos.size !== 0) {
    show(
      "3. Close proposal",
      await engine.handle({ ...base, proposalId: randomUUID(), side: pos.size > 0 ? "long" : "short", size: Math.abs(pos.size), leverage: 1, intent: "close", rationale: "smoke test done, closing" } satisfies TradeProposal),
    );
    await new Promise((r) => setTimeout(r, 2000));
    show("Positions after close", await exchange.positions(vaultId));
  }
}
