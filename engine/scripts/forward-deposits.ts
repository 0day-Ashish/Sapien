// Forwards deposits from the Deposit Account to their Vaults (#6). Polls `DepositForBurn` on Base Sepolia from the
// MockCctpForwarder, credits each depositor's Vault on HyperCore, and prints the engine's `deposit-landed` event.
// Progress is kept in engine/.state/deposits.json so a burn is never forwarded twice.
//
//   engine/.env.local: DEPOSIT_ACCOUNT_PRIVATE_KEY, ENGINE_OPERATOR_PRIVATE_KEY
//   npm run deposits:forward            # keep polling
//   npm run deposits:forward -- --once  # one pass

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Address, createPublicClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { forwardDeposit } from "../src/deposits/forward.js";
import { liveDepositPorts, readBurns } from "../src/deposits/live.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const hyperEvm = json("../../contracts/deployments/hyperevm-testnet.json");
const base = json("../../contracts/deployments/base-sepolia.json");
const depositAccountAddress: Address = json("../config.json").depositAccount.address;

const depositAccount = privateKeyToAccount(process.env.DEPOSIT_ACCOUNT_PRIVATE_KEY as Hex);
if (depositAccount.address.toLowerCase() !== depositAccountAddress.toLowerCase()) throw new Error("DEPOSIT_ACCOUNT_PRIVATE_KEY doesn't match engine/config.json");
const ports = liveDepositPorts({
  isTestnet: true,
  vaultFactory: hyperEvm.VaultFactory.address,
  depositAccount,
  engine: privateKeyToAccount(process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex),
});
// No chain object: the OP-stack chain types make the client incompatible with a plain PublicClient.
const source = createPublicClient({ transport: http(baseSepolia.rpcUrls.default.http[0]) });
const messenger: Address = base.MockCctpForwarder.address;

const stateDir = new URL("../.state/", import.meta.url);
const stateFile = new URL("deposits.json", stateDir);
type State = { nextBlock: string; done: Record<string, unknown> };
const state: State = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : { nextBlock: String(base.MockCctpForwarder.deployBlock), done: {} };
const save = () => {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
};

async function pass() {
  const head = await source.getBlockNumber();
  const from = BigInt(state.nextBlock);
  if (from > head) return;
  for (const burn of await readBurns(source, messenger, from, head)) {
    if (state.done[burn.id]) continue;
    console.log(`burn ${burn.id}: ${burn.depositor} ${Number(burn.amount) / 1e6} USDC (maxFee ${Number(burn.maxFee) / 1e6})`);
    const result = await forwardDeposit(burn, depositAccountAddress, ports);
    console.log(result.status === "forwarded" ? { ...result, sent: String(result.sent) } : result);
    state.done[burn.id] = result.status === "forwarded" ? { vault: result.vault, sent: String(result.sent), event: result.event } : result;
    save();
  }
  state.nextBlock = String(head + 1n);
  save();
}

const once = process.argv.includes("--once");
do {
  await pass();
  if (!once) await new Promise((r) => setTimeout(r, 5000));
} while (!once);
