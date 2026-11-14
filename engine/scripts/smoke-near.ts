// Read-only look at the NEAR side: contract config, agents, the latest deposits and withdrawals and, for
// NEAR_SMOKE_ACCOUNT, its Vault record and that Vault's HyperCore balance. Needs no secrets.
//   NEAR_SMOKE_ACCOUNT=alice.testnet npm run smoke:near

import { existsSync } from "node:fs";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { NearContract, nearConfigFromEnv } from "../src/adapters/near.js";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const show = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
const usdc = (n: bigint) => `${Number(n) / 1e6} USDC`;

// Never signs: the key is left out on purpose.
const { privateKey: _key, ...readOnly } = nearConfigFromEnv();
const near = new NearContract(readOnly);
const config = await near.config();
console.log("config", show(config));
console.log("agents", show(await near.agents()));

const latest = (next: number, n = 5) => Array.from({ length: Math.min(n, next) }, (_, i) => next - 1 - i);
for (const id of latest(config.deposits)) {
  const d = await near.deposit(id);
  console.log(`deposit ${id}`, d ? `${d.account} -> ${d.evmVault}  ${usdc(d.amount)}` : "(not stored)");
}
for (const id of latest(config.withdrawals)) {
  const w = await near.withdrawal(id);
  console.log(`withdrawal ${id}`, w ? `${w.account}  ${usdc(w.requested)} requested, ${usdc(w.paid)} paid, ${w.status}` : "(none)");
}

const account = process.env.NEAR_SMOKE_ACCOUNT;
if (!account) console.log("Set NEAR_SMOKE_ACCOUNT to inspect an account's Vault.");
else {
  const vault = await near.vaultOf(account);
  console.log(`vault_of(${account})`, show(vault));
  if (vault) {
    const info = new InfoClient({ transport: new HttpTransport({ isTestnet: true }) });
    const [perp, spot] = await Promise.all([info.clearinghouseState({ user: vault.evmVault as `0x${string}` }), info.spotClearinghouseState({ user: vault.evmVault as `0x${string}` })]);
    console.log("HyperCore perp accountValue", perp.marginSummary.accountValue, "withdrawable", perp.withdrawable);
    console.log("HyperCore spot USDC", spot.balances.find((b) => b.coin === "USDC")?.total ?? "0");
  }
}
