// Testnet smoke (spec seam 3, tickets #6 + #7): the full money round trip on the TEAM deployment.
//   Base Sepolia deposit (MockCctpForwarder, real CCTP args) -> Deposit Account -> Vault on HyperCore
//   -> withdrawToEvm (HyperCore -> HyperEVM) -> bridgeOut (CCTP V2 + Circle forwarding) -> minted on Base Sepolia.
// The engine operator plays the user (Vault owner); the Agent Wallet comes from the engine's store, as via
// POST /agent-wallets. Trading and the Kill Switch join this once #9 lands.
//
//   engine/.env.local: ENGINE_OPERATOR_PRIVATE_KEY (HYPE on HyperEVM, ETH + USDC on Base Sepolia),
//                      DEPOSIT_ACCOUNT_PRIVATE_KEY (USDC float on HyperCore)
//   npm run smoke:round-trip [-- --amount 5]
//   npm run smoke:round-trip -- --amount 15 --keep
//     #5: stops once the Vault is funded, signs its first Mandate Version, reads it back through the engine's chain
//     port, and sets RUNNER_VAULT / RUNNER_AGENT_PRIVATE_KEY in engine/.env.local for `npm run engine`.

import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Address, createPublicClient, createWalletClient, type Hex, http, padHex, parseAbi, parseEventLogs, parseUnits, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { HyperEvmChain, hyperEvmTestnet } from "../src/adapters/hyperevm.js";
import { forwardDeposit } from "../src/deposits/forward.js";
import { liveDepositPorts, readBurns } from "../src/deposits/live.js";
import { AgentWalletStore } from "../src/service/agent-wallets.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const hyperEvm = json("../../contracts/deployments/hyperevm-testnet.json");
const baseDeploy = json("../../contracts/deployments/base-sepolia.json");
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
const KEEP = process.argv.includes("--keep");
const DEPOSIT = parseUnits(amountArg > 0 ? process.argv[amountArg + 1]! : "5", 6);
const USDC_BASE: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_EVM: Address = "0x2B3370eE501B4a559b57D449569354196457D8Ab";
const FORWARDER32 = padHex("0x02e39ECb8368b41bF68FF99ff351aC9864e5E2a2", { size: 32 });
const HOOK: Hex = `0x636374702d666f72776172640000000000000000000000000000000000000018${depositAccountAddress.slice(2).toLowerCase()}00000000`;

const owner = privateKeyToAccount(process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex);
const depositAccount = privateKeyToAccount(process.env.DEPOSIT_ACCOUNT_PRIVATE_KEY as Hex);
const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
const evmWallet = createWalletClient({ account: owner, chain: hyperEvmTestnet, transport: http() });
const baseRpc = http(baseSepolia.rpcUrls.default.http[0]);
const base = createPublicClient({ transport: baseRpc });
const baseWallet = createWalletClient({ account: owner, chain: baseSepolia, transport: baseRpc });
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: true }) });
const store = new AgentWalletStore(new URL("../.data/agent-wallets.json", import.meta.url).pathname);
const ports = liveDepositPorts({ isTestnet: true, vaultFactory: hyperEvm.VaultFactory.address, depositAccount, engine: owner, agentWallets: store });

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function approve(address, uint256) returns (bool)"]);
const factoryAbi = parseAbi([
  "function createVault(address agentWallet) returns (address)",
  "event VaultCreated(address indexed owner, address indexed vault, address agentWallet)",
]);
const vaultAbi = parseAbi(["function withdrawToEvm(uint64 amount)", "function bridgeOut(uint256 amount, uint32 destinationDomain, bytes32 recipient, uint256 maxFee)"]);
const messengerAbi = parseAbi([
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)",
]);

async function sendTx(client: any, publicClient: any, label: string, req: Record<string, unknown>) {
  const hash = await client.writeContract(req);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: tx ${hash}`);
  return receipt;
}

async function feeQuote(from: number, to: number, finality: number, amount: bigint, hyperCoreDeposit: boolean) {
  const res = await fetch(`https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/${from}/${to}?forward=true${hyperCoreDeposit ? "&hyperCoreDeposit=true" : ""}`);
  const q = ((await res.json()) as { finalityThreshold: number; minimumFee: number; forwardFee: { high: number } }[]).find((x) => x.finalityThreshold === finality)!;
  return (amount * BigInt(Math.round(q.minimumFee * 100)) + 999_999n) / 1_000_000n + BigInt(q.forwardFee.high);
}

const baseBalance = () => base.readContract({ address: USDC_BASE, abi: erc20, functionName: "balanceOf", args: [owner.address] });
const startBalance = await baseBalance();
if (startBalance < DEPOSIT) throw new Error(`Owner has ${usdc(startBalance)} on Base Sepolia, needs ${usdc(DEPOSIT)} (faucet.circle.com)`);

step("1. Create Vault (Agent Wallet from the engine store)");
const agent = store.create();
const created = await sendTx(evmWallet, evm, "createVault", { address: hyperEvm.VaultFactory.address, abi: factoryAbi, functionName: "createVault", args: [agent] });
const vault = parseEventLogs({ abi: factoryAbi, logs: created.logs, eventName: "VaultCreated" })[0]!.args.vault as Address;
console.log(`Vault ${vault}, Agent Wallet ${agent}`);

step(`2. Deposit ${usdc(DEPOSIT)} from Base Sepolia (MockCctpForwarder ${baseDeploy.MockCctpForwarder.address})`);
const depositFee = await feeQuote(6, 19, 1000, DEPOSIT, true);
await sendTx(baseWallet, base, "approve", { address: USDC_BASE, abi: erc20, functionName: "approve", args: [baseDeploy.MockCctpForwarder.address, DEPOSIT] });
const burnReceipt = await sendTx(baseWallet, base, "depositForBurnWithHook", {
  address: baseDeploy.MockCctpForwarder.address,
  abi: messengerAbi,
  functionName: "depositForBurnWithHook",
  args: [DEPOSIT, 19, FORWARDER32, USDC_BASE, FORWARDER32, depositFee, 1000, HOOK],
});
console.log(`maxFee ${usdc(depositFee)}`);

step("3. Engine forwards Deposit Account -> Vault on HyperCore");
const burn = (await readBurns(base as never, baseDeploy.MockCctpForwarder.address, burnReceipt.blockNumber, burnReceipt.blockNumber)).find((b) =>
  b.id.startsWith(burnReceipt.transactionHash),
);
if (!burn) throw new Error("DepositForBurn not found");
const forwarded = await forwardDeposit(burn, depositAccountAddress, ports);
if (forwarded.status !== "forwarded") throw new Error(`not forwarded: ${forwarded.reason}`);
console.log("engine event:", forwarded.event);
// Keep the background forwarder from crediting this burn again.
const stateUrl = new URL("../.state/deposits.json", import.meta.url);
const state = existsSync(stateUrl)
  ? JSON.parse(readFileSync(stateUrl, "utf8"))
  : { nextBlock: String(baseDeploy.MockCctpForwarder.deployBlock), done: {} };
state.done[burn.id] = { vault, sent: String(forwarded.sent), event: forwarded.event, by: "smoke:round-trip" };
mkdirSync(new URL("../.state/", import.meta.url), { recursive: true });
writeFileSync(stateUrl, JSON.stringify(state, null, 2));
const withdrawable = await until("Vault perp balance", async () => {
  const w = (await info.clearinghouseState({ user: vault })).withdrawable;
  return Number(w) > 0 ? w : null;
}, 60_000);
console.log(`Vault perp withdrawable: ${withdrawable} USDC`);
await until("Agent Wallet registered on HyperCore", async () => {
  const r = await info.userRole({ user: agent as Address });
  return r.role === "agent" ? r : null;
}, 60_000);
console.log(`Agent Wallet ${agent} is the Vault's agent on HyperCore; bound in the engine store`);

if (KEEP) {
  step("4. Sign the first Mandate Version (#5) and keep the Vault for the engine");
  // Same JSON and caps as the UI (frontend/lib/vault/mandate.ts): first version, effective at once.
  const mandate = { allowedAssets: ["ETH", "BTC"], leverageCap: 3, stopLossPct: 2, drawdownCapPct: 10, vetoThresholdUsdc: 1000, blackoutWindows: [] };
  const registryAbi = parseAbi([
    "function signMandateVersion(address vault, bytes mandateJson, uint32 leverageCapE2, uint16 stopLossBps, uint16 drawdownCapBps, uint64 vetoThresholdUsdc, bool killFlag, bool scopeNotLoosened) returns (uint256)",
  ]);
  await sendTx(evmWallet, evm, "signMandateVersion", {
    address: hyperEvm.MandateRegistry.address,
    abi: registryAbi,
    functionName: "signMandateVersion",
    args: [vault, toHex(JSON.stringify(mandate)), 300, 200, 1000, 1_000_000_000n, false, false],
  });
  const chainPort = new HyperEvmChain({ mandateRegistry: hyperEvm.MandateRegistry.address, decisionLog: hyperEvm.DecisionLog.address, engine: owner });
  console.log("Engine chain port reads:", await chainPort.currentMandate(vault));

  const entries = JSON.parse(readFileSync(new URL("../.data/agent-wallets.json", import.meta.url), "utf8")) as { address: string; privateKey: string }[];
  const key = entries.find((e) => e.address.toLowerCase() === agent.toLowerCase())!.privateKey;
  const envFile = new URL("../.env.local", import.meta.url).pathname;
  const env = readFileSync(envFile, "utf8").replace(/^RUNNER_VAULT=.*\n?/m, "").replace(/^RUNNER_AGENT_PRIVATE_KEY=.*\n?/m, "");
  writeFileSync(envFile, env.endsWith("\n") ? env : `${env}\n`, { mode: 0o600 });
  appendFileSync(envFile, `RUNNER_VAULT=${vault}\nRUNNER_AGENT_PRIVATE_KEY=${key}\n`);
  console.log(`\nKept Vault ${vault} (Agent Wallet ${agent}). RUNNER_VAULT and RUNNER_AGENT_PRIVATE_KEY set in engine/.env.local.`);
  process.exit(0);
}

step("4. withdrawToEvm: HyperCore -> the Vault's HyperEVM address");
// Everything but a reserve: HyperCore takes its HyperEVM transfer fee (~0.025 USDC) from what's left, and drops a
// send of the whole balance silently.
const amount = BigInt(Math.floor(Number(withdrawable) * 1e6)) - 50_000n;
await sendTx(evmWallet, evm, "withdrawToEvm", { address: vault, abi: vaultAbi, functionName: "withdrawToEvm", args: [amount] });
await until("USDC on HyperEVM", async () => {
  const b = await evm.readContract({ address: USDC_EVM, abi: erc20, functionName: "balanceOf", args: [vault] });
  return b >= amount ? b : null;
}, 120_000);
console.log(`${usdc(amount)} on HyperEVM`);

step("5. bridgeOut: CCTP V2 + Circle forwarding to Base Sepolia");
const withdrawFee = await feeQuote(19, 6, 2000, amount, false);
const out = await sendTx(evmWallet, evm, "bridgeOut", {
  address: vault,
  abi: vaultAbi,
  functionName: "bridgeOut",
  args: [amount, 6, padHex(owner.address, { size: 32 }), withdrawFee],
});
console.log(`maxFee ${usdc(withdrawFee)}`);

step("6. Wait for Circle to mint on Base Sepolia");
let last = "";
const mintTx = await until("mint", async () => {
  const res = await fetch(`https://iris-api-sandbox.circle.com/v2/messages/19?transactionHash=${out.transactionHash}`);
  if (!res.ok) return null;
  const m = ((await res.json()) as { messages?: Record<string, unknown>[] }).messages?.[0];
  const now = `${m?.status}/${m?.forwardState}/${m?.delayReason ?? ""}`;
  if (now !== last) console.log(`  ${now}`);
  last = now;
  return (m?.destinationMintTxHash as string) || null;
}, 20 * 60_000, 10_000);
const endBalance = await baseBalance();
console.log(`Minted: tx ${mintTx}`);
console.log(`\nRound trip: ${usdc(DEPOSIT)} out, ${usdc(endBalance - startBalance + DEPOSIT)} back (CCTP fees + 1 USDC Vault activation)`);
