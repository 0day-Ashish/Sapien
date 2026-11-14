// Moves USDC that landed in a Vault's spot balance into its perp balance, signed by the Vault's Agent Wallet.
// Allowed because the transfer stays inside the Vault's own account (agentSendAsset, #4 finding 6e).
//   npx tsx scripts/vault-spot-to-perp.ts [amount]   (default: all spot USDC)
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const vault = (process.env.RUNNER_VAULT ?? process.env.SMOKE_VAULT) as `0x${string}`;
const agent = privateKeyToAccount((process.env.RUNNER_AGENT_PRIVATE_KEY ?? process.env.SMOKE_AGENT_PRIVATE_KEY) as Hex);
const transport = new HttpTransport({ isTestnet: true });
const info = new InfoClient({ transport });

const spot = Number((await info.spotClearinghouseState({ user: vault })).balances.find((b) => b.coin === "USDC")?.total ?? 0);
const amount = process.argv[2] ?? String(Math.floor(spot * 100) / 100);
await new ExchangeClient({ transport, wallet: agent }).agentSendAsset({
  destination: vault,
  sourceDex: "spot",
  destinationDex: "",
  token: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
  amount,
});
await new Promise((r) => setTimeout(r, 2500));
const perp = (await info.clearinghouseState({ user: vault })).marginSummary.accountValue;
console.log(`Moved ${amount} USDC spot -> perp in ${vault}. Perp value now ${perp}`);
