// The NEAR money loop. Polls the Sapien Contract (sapien-vault.testnet) and
//   - forwards each deposit from the Deposit Account to the depositor's Vault on HyperCore, once (cursor in
//     engine/.data/near-deposits.json), and prints the engine's `deposit-landed` event;
//   - pays withdrawals: once the Vault is Flat, Vault.withdrawToEvm as the Vault's owner (the engine operator), then
//     NEAR pay_withdraw (testnet mirror: paid from the contract's USDC pool). Cursor in .data/near-withdrawals.json.
//
//   engine/.env.local: DEPOSIT_ACCOUNT_PRIVATE_KEY, ENGINE_OPERATOR_PRIVATE_KEY, NEAR_ENGINE_PRIVATE_KEY (+ NEAR_* in .env.example)
//   npm run deposits:forward            # keep polling
//   npm run deposits:forward -- --once  # one pass

import { existsSync, readFileSync } from "node:fs";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NearContract, nearConfigFromEnv } from "../src/adapters/near.js";
import { liveDepositPorts } from "../src/deposits/live.js";
import { liveEvmPorts } from "../src/near/evm.js";
import { pollDeposits, type DepositCursor } from "../src/near/deposits.js";
import { JsonFileState } from "../src/near/state.js";
import { pollWithdrawals, type WithdrawalCursor } from "../src/near/withdrawals.js";
import { AgentWalletStore } from "../src/service/agent-wallets.js";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const hyperEvm = json("../../contracts/deployments/hyperevm-testnet.json");
const depositAccountAddress: Address = json("../config.json").depositAccount.address;

const depositAccount = privateKeyToAccount(process.env.DEPOSIT_ACCOUNT_PRIVATE_KEY as Hex);
if (depositAccount.address.toLowerCase() !== depositAccountAddress.toLowerCase()) throw new Error("DEPOSIT_ACCOUNT_PRIVATE_KEY doesn't match engine/config.json");
const engine = privateKeyToAccount(process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex);

const near = new NearContract(nearConfigFromEnv());
if (!near.canSign) throw new Error("Set NEAR_ENGINE_PRIVATE_KEY in engine/.env.local");
const deposits = liveDepositPorts({ isTestnet: true, depositAccount, engine, agentWallets: new AgentWalletStore(`${root}.data/agent-wallets.json`) });
const evm = liveEvmPorts({ operator: engine, vaultFactory: hyperEvm.VaultFactory.address, mandateRegistry: hyperEvm.MandateRegistry.address });
const depositState = new JsonFileState<DepositCursor>(`${root}.data/near-deposits.json`, () => ({ next: 0 }));
const withdrawalState = new JsonFileState<WithdrawalCursor>(`${root}.data/near-withdrawals.json`, () => ({ from: 0, moved: {} }));

const stamp = () => new Date().toISOString();
const show = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));

async function pass() {
  await pollDeposits(near, deposits, depositState, (p) => console.log(`${stamp()} deposit ${p.id} ${p.account ?? ""}`, show(p.result)));
  await pollWithdrawals(near, evm, withdrawalState, (p) => {
    // Waiting on a Flat Vault is the normal state of a withdrawal; say it once per pass, quietly.
    if (p.result !== "already-paid") console.log(`${stamp()} withdrawal ${p.id}`, show(p));
  });
}

const once = process.argv.includes("--once");
do {
  await pass().catch((e) => console.error(`${stamp()} pass failed, retrying:`, (e as Error).message));
  if (!once) await new Promise((r) => setTimeout(r, 10_000));
} while (!once);
