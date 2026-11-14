// Testnet smoke (spec seam 3, ticket #22): the money round trip from and back to Solana devnet, on the TEAM deployment.
//   Solana devnet USDC --deposit_for_burn_with_hook (real CCTP V2, hook = Vault)--> Deposit Account on HyperEVM
//   --engine relays receiveMessage; Deposit Account on HyperCore --usdSend--> Vault
//   --withdrawToEvm, bridgeOut (CCTP V2 + Circle forwarding)--> the user's USDC token account on Solana.
// Testnet CCTP and CoreDepositWallet can't reach HyperCore for testnet-only accounts (README), so the deposit mints on
// HyperEVM and the Vault is credited from the Deposit Account's HyperCore float.
// The engine operator owns the Vault; the Solana key plays the user's Solana wallet.
//
//   engine/.env.local: SOLANA_SMOKE_KEYPAIR (JSON secret key; devnet SOL + USDC from faucet.circle.com),
//                      ENGINE_OPERATOR_PRIVATE_KEY (HYPE on HyperEVM), DEPOSIT_ACCOUNT_PRIVATE_KEY,
//                      optional SOLANA_RPC_URL
//   npm run smoke:solana [-- --amount 3]

import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { Connection, Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Address, createPublicClient, createWalletClient, type Hex, http, pad, parseAbi, parseEther, parseEventLogs, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hyperEvmTestnet } from "../src/adapters/hyperevm.js";
import { HYPEREVM_CCTP, IRIS_SANDBOX, liveSolanaDepositPorts } from "../src/deposits/live-solana.js";
import {
  createUsdcTokenAccountInstruction,
  depositForBurnWithHookInstruction,
  forwardSolanaDeposit,
  HYPEREVM_DOMAIN,
  SOLANA_DOMAIN,
  type SolanaBurn,
  solanaToBytes32,
  STANDARD_FINALITY,
  usdcTokenAccount,
  vaultHookData,
} from "../src/deposits/solana.js";
import { AgentWalletStore } from "../src/service/agent-wallets.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const hyperEvm = json("../../contracts/deployments/hyperevm-testnet.json");
const depositAccountAddress: Address = json("../config.json").depositAccount.address;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: string) => console.log(`\n== ${s}`);
const usdc = (v: bigint) => `${Number(v) / 1e6} USDC`;
async function until<T>(what: string, f: () => Promise<T | undefined | null | false>, timeoutMs: number, everyMs = 3000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await f();
    if (v) return v as T;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(everyMs);
  }
}

const amountArg = process.argv.indexOf("--amount");
const DEPOSIT = parseUnits(amountArg > 0 ? process.argv[amountArg + 1]! : "3", 6);

const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SOLANA_SMOKE_KEYPAIR!)));
const userUsdc = usdcTokenAccount(user.publicKey);
const solana = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const owner = privateKeyToAccount(process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex);
const depositAccount = privateKeyToAccount(process.env.DEPOSIT_ACCOUNT_PRIVATE_KEY as Hex);
const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
const evmWallet = createWalletClient({ account: owner, chain: hyperEvmTestnet, transport: http() });
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: true }) });
const store = new AgentWalletStore(new URL("../.data/agent-wallets.json", import.meta.url).pathname);
const ports = liveSolanaDepositPorts({ isTestnet: true, vaultFactory: hyperEvm.VaultFactory.address, depositAccount, engine: owner, agentWallets: store });

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const factoryAbi = parseAbi([
  "function createVault(address agentWallet) returns (address)",
  "event VaultCreated(address indexed owner, address indexed vault, address agentWallet)",
]);
const vaultAbi = parseAbi(["function withdrawToEvm(uint64 amount)", "function bridgeOut(uint256 amount, uint32 destinationDomain, bytes32 recipient, uint256 maxFee)"]);

async function sendTx(label: string, req: Record<string, unknown>) {
  const hash = await evmWallet.writeContract(req as never);
  const receipt = await evm.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: tx ${hash}`);
  return receipt;
}
const solanaUsdc = async () => BigInt((await solana.getTokenAccountBalance(userUsdc).catch(() => ({ value: { amount: "0" } }))).value.amount);

const startBalance = await solanaUsdc();
console.log(`Solana wallet ${user.publicKey.toBase58()}, USDC account ${userUsdc.toBase58()}: ${usdc(startBalance)}`);
if (startBalance < DEPOSIT) throw new Error(`needs ${usdc(DEPOSIT)} devnet USDC (faucet.circle.com, Solana Devnet)`);

step("0. Gas: the Deposit Account signs its HyperEVM calls");
if ((await evm.getBalance({ address: depositAccountAddress })) < parseEther("0.0005")) {
  const hash = await evmWallet.sendTransaction({ to: depositAccountAddress, value: parseEther("0.001") });
  await evm.waitForTransactionReceipt({ hash });
  console.log(`0.001 HYPE -> Deposit Account: tx ${hash}`);
}

step("1. Create Vault (Agent Wallet from the engine store)");
const agent = store.create();
const created = await sendTx("createVault", { address: hyperEvm.VaultFactory.address, abi: factoryAbi, functionName: "createVault", args: [agent] });
const vault = parseEventLogs({ abi: factoryAbi, logs: created.logs, eventName: "VaultCreated" })[0]!.args.vault as Address;
console.log(`Vault ${vault}, Agent Wallet ${agent}`);

step(`2. Burn ${usdc(DEPOSIT)} on Solana devnet: CCTP V2 to the Deposit Account on HyperEVM, hook = Vault`);
const params = {
  amount: DEPOSIT,
  destinationDomain: HYPEREVM_DOMAIN,
  mintRecipient: pad(depositAccountAddress.toLowerCase() as Hex, { size: 32 }),
  destinationCaller: pad("0x", { size: 32 }),
  maxFee: 0n,
  minFinalityThreshold: STANDARD_FINALITY,
  hookData: vaultHookData(vault),
};
const event = Keypair.generate();
const sig = await sendAndConfirmTransaction(solana, new Transaction().add(depositForBurnWithHookInstruction(user.publicKey, event.publicKey, params)), [user, event]);
console.log(`deposit_for_burn_with_hook: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
const burn: SolanaBurn = { ...params, id: sig, depositor: user.publicKey.toBase58() };

step("3. Engine: wait for Circle's attestation, relay, credit the Vault");
const forwarded = await until("attestation", async () => {
  const r = await forwardSolanaDeposit(burn, depositAccountAddress, ports);
  if (r.status === "skipped") throw new Error(`skipped: ${r.reason}`);
  return r.status === "forwarded" ? r : null;
}, 30 * 60_000, 10_000);
console.log("engine event:", forwarded.event);
// Keep the background forwarder from crediting this burn again.
const stateUrl = new URL("../.state/deposits.json", import.meta.url);
if (existsSync(stateUrl)) {
  const state = JSON.parse(readFileSync(stateUrl, "utf8"));
  state.done[sig] = { vault, sent: String(forwarded.sent), event: forwarded.event, by: "smoke:solana" };
  if (state.solana) delete state.solana.pending[sig];
  mkdirSync(new URL("../.state/", import.meta.url), { recursive: true });
  writeFileSync(stateUrl, JSON.stringify(state, null, 2));
}
const withdrawable = await until("Vault perp balance", async () => {
  const w = (await info.clearinghouseState({ user: vault })).withdrawable;
  return Number(w) > 0 ? w : null;
}, 120_000);
console.log(`Vault perp withdrawable: ${withdrawable} USDC`);
await until("Agent Wallet registered on HyperCore", async () => ((await info.userRole({ user: agent as Address })).role === "agent" ? true : null), 60_000);
console.log(`Agent Wallet ${agent} is the Vault's agent on HyperCore`);

step("4. withdrawToEvm: HyperCore -> the Vault's HyperEVM address (keeps HyperCore's transfer-fee reserve)");
const amount = BigInt(Math.floor(Number(withdrawable) * 1e6)) - 50_000n;
await sendTx("withdrawToEvm", { address: vault, abi: vaultAbi, functionName: "withdrawToEvm", args: [amount] });
await until("USDC on HyperEVM", async () => {
  const b = await evm.readContract({ address: HYPEREVM_CCTP.usdc, abi: erc20, functionName: "balanceOf", args: [vault] });
  return b >= amount ? b : null;
}, 120_000);
console.log(`${usdc(amount)} on HyperEVM`);

step("5. Ensure the user's USDC token account exists, then bridgeOut to it (CCTP V2 + Circle forwarding)");
await sendAndConfirmTransaction(solana, new Transaction().add(createUsdcTokenAccountInstruction(user.publicKey, user.publicKey)), [user]);
const res = await fetch(`${IRIS_SANDBOX}/v2/burn/USDC/fees/${HYPEREVM_DOMAIN}/${SOLANA_DOMAIN}?forward=true`);
const q = ((await res.json()) as { finalityThreshold: number; minimumFee: number; forwardFee: { high: number } }[]).find((x) => x.finalityThreshold === STANDARD_FINALITY)!;
const withdrawFee = (amount * BigInt(Math.round(q.minimumFee * 100)) + 999_999n) / 1_000_000n + BigInt(q.forwardFee.high);
const out = await sendTx("bridgeOut", { address: vault, abi: vaultAbi, functionName: "bridgeOut", args: [amount, SOLANA_DOMAIN, solanaToBytes32(userUsdc), withdrawFee] });
console.log(`maxFee ${usdc(withdrawFee)}`);

step("6. Wait for Circle to mint on Solana");
let last = "";
const mintTx = await until("mint", async () => {
  const r = await fetch(`${IRIS_SANDBOX}/v2/messages/${HYPEREVM_DOMAIN}?transactionHash=${out.transactionHash}`);
  if (!r.ok) return null;
  const m = ((await r.json()) as { messages?: Record<string, unknown>[] }).messages?.[0];
  const now = `${m?.status}/${m?.forwardState}/${m?.delayReason ?? ""}`;
  if (now !== last) console.log(`  ${now}`);
  last = now;
  if (m?.forwardState === "FAILED") throw new Error("Circle forwarding to Solana failed");
  return (m?.forwardTxHash as string) || (m?.destinationMintTxHash as string) || null;
}, 20 * 60_000, 10_000);
const endBalance = await until("USDC on Solana", async () => {
  const b = await solanaUsdc();
  return b > startBalance - DEPOSIT ? b : null;
}, 120_000);
console.log(`Minted: https://explorer.solana.com/tx/${mintTx}?cluster=devnet`);
console.log(`\nRound trip: ${usdc(DEPOSIT)} out, ${usdc(endBalance - startBalance + DEPOSIT)} back (CCTP fees + 1 USDC Vault activation)`);
