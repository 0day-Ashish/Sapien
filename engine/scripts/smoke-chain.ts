// End-to-end testnet smoke for #31: a real Vault, a signed Mandate, and a guarded trade whose Decision Commitment
// lands in the DecisionLog before the order. Deploys its OWN throwaway copies of VaultFactory, MandateRegistry and
// DecisionLog (not the team deployment), with one testnet key acting as engine operator and Vault owner.
//
//   engine/.env.local: SMOKE_OWNER_PRIVATE_KEY (HYPE on HyperEVM, USDC on HyperCore). The script adds the rest.
//   cd contracts && forge build && cd ../engine && npm run smoke:chain

import { HttpTransport, ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { type Address, createPublicClient, createWalletClient, type Hex, http, parseEventLogs, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { HyperEvmChain, hyperEvmTestnet } from "../src/adapters/hyperevm.js";
import { HyperliquidExchange } from "../src/adapters/hyperliquid.js";
import { createEngine } from "../src/index.js";

const envFile = new URL("../.env.local", import.meta.url).pathname;
process.loadEnvFile(envFile);
const setEnv = (k: string, v: string) => {
  appendFileSync(envFile, `${k}=${v}\n`);
  process.env[k] = v;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: string) => console.log(`\n== ${s}`);

const owner = privateKeyToAccount(process.env.SMOKE_OWNER_PRIVATE_KEY as Hex);
if (!process.env.SMOKE_AGENT_PRIVATE_KEY) setEnv("SMOKE_AGENT_PRIVATE_KEY", generatePrivateKey()); // fresh: agents can't be reused
const agent = privateKeyToAccount(process.env.SMOKE_AGENT_PRIVATE_KEY as Hex);

const pub = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
const wallet = createWalletClient({ account: owner, chain: hyperEvmTestnet, transport: http() });
const hlTransport = new HttpTransport({ isTestnet: true });
const info = new InfoClient({ transport: hlTransport });

const artifact = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8"));
const abiOf = (name: string) => artifact(name).abi;

async function deploy(name: string, args: unknown[]) {
  const a = artifact(name);
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`${name} ${r.contractAddress} (tx ${hash})`);
  return r.contractAddress!;
}
async function send(address: Address, name: string, functionName: string, args: unknown[]) {
  const hash = await wallet.writeContract({ address, abi: abiOf(name), functionName, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${name}.${functionName} reverted: ${hash}`);
  return r;
}

step("1. Contracts (throwaway copies, engine operator = smoke owner)");
if (!process.env.SMOKE_VAULT_FACTORY) {
  setEnv("SMOKE_VAULT_FACTORY", await deploy("VaultFactory", [owner.address]));
  setEnv("SMOKE_MANDATE_REGISTRY", await deploy("MandateRegistry", []));
  setEnv("SMOKE_DECISION_LOG", await deploy("DecisionLog", [owner.address]));
}
const factory = process.env.SMOKE_VAULT_FACTORY as Address;
const registry = process.env.SMOKE_MANDATE_REGISTRY as Address;
const decisionLog = process.env.SMOKE_DECISION_LOG as Address;
console.log({ factory, registry, decisionLog });

step("2. Create a Vault for the Agent Wallet");
if (!process.env.SMOKE_VAULT) {
  const r = await send(factory, "VaultFactory", "createVault", [agent.address]);
  const [created] = parseEventLogs({ abi: abiOf("VaultFactory"), logs: r.logs, eventName: "VaultCreated" }) as unknown as { args: { vault: Address } }[];
  setEnv("SMOKE_VAULT", created!.args.vault);
}
const vault = process.env.SMOKE_VAULT as Address;
console.log("Vault", vault, "agent", agent.address);

step("3. Activate the Vault's HyperCore account, then re-register the Agent Wallet (CoreWriter dropped the first one)");
const ch = await info.clearinghouseState({ user: vault });
if (Number(ch.marginSummary.accountValue) < 5) {
  await new ExchangeClient({ transport: hlTransport, wallet: owner }).usdSend({ destination: vault, amount: "12" });
  await sleep(3000);
}
const isAgent = async () => (await info.extraAgents({ user: vault })).some((x) => x.address.toLowerCase() === agent.address.toLowerCase());
if (!(await isAgent())) {
  await send(vault, "Vault", "registerAgentWallet", [agent.address]);
  for (let i = 0; i < 15 && !(await isAgent()); i++) await sleep(2000);
}
console.log("Vault value", (await info.clearinghouseState({ user: vault })).marginSummary.accountValue, "agent registered", await isAgent());

step("4. Sign a Mandate Version (the smoke owner is the Vault owner)");
const chainPort = new HyperEvmChain({ mandateRegistry: registry, decisionLog, engine: owner });
const mandateJson = {
  allowedAssets: ["BTC", "ETH"],
  leverageCap: 3,
  stopLossPct: 2,
  drawdownCapPct: 10,
  blackoutWindows: [{ event: "US_CPI", start: 1_800_000_000, end: 1_800_003_600 }],
  vetoThresholdUsdc: 500,
};
const versions = await pub.readContract({ address: registry, abi: abiOf("MandateRegistry"), functionName: "versionCount", args: [vault] });
if (versions === 0n) {
  await send(registry, "MandateRegistry", "signMandateVersion", [vault, toHex(JSON.stringify(mandateJson)), 300, 200, 1000, 500_000_000n, false, true]);
}
console.log("Engine reads", await chainPort.currentMandate(vault));

step("5. A guarded trade: Mandate Check, Decision Commitment onchain, then entry + stop-loss");
const exchange = new HyperliquidExchange({ isTestnet: true, agentFor: () => agent });
const engine = createEngine({ exchange, chain: chainPort });
const mark = await exchange.markPrice("ETH");
const base = { type: "trade-proposal", vaultId: vault, agentId: "momentum", asset: "ETH", confidence: 0.72 } as const;

const over = await engine.handle({ ...base, proposalId: randomUUID(), side: "long", size: 11 / mark, leverage: 5, intent: "open", rationale: "breakout, too aggressive" });
console.log("Over the cap:", over.kind === "rejected" ? over.rejection : over.kind);

const opened = await engine.handle({ ...base, proposalId: randomUUID(), side: "long", size: 11 / mark, leverage: 2, intent: "open", rationale: "breakout above the 4h range, re-planned at 2x" });
if (opened.kind !== "executed") throw new Error(`expected execution: ${JSON.stringify(opened)}`);
const [committed, at] = (await pub.readContract({ address: decisionLog, abi: abiOf("DecisionLog"), functionName: "isCommitted", args: [opened.decisionHash] })) as [boolean, bigint];
console.log({ decisionHash: opened.decisionHash, commitmentTx: opened.commitmentTx, committedOnchain: committed, at: Number(at) });
await sleep(2000);
console.log("Stop-loss", opened.stopLoss?.cloid, await exchange.orderStatus(vault, opened.stopLoss!.cloid));

step("6. Close, then the fill reports the Vault Flat");
const pos = (await exchange.positions(vault)).find((p) => p.asset === "ETH");
if (pos) {
  const closed = await engine.handle({ ...base, proposalId: randomUUID(), side: "long", size: Math.abs(pos.size), leverage: 1, intent: "close", rationale: "smoke done" });
  console.log("Close:", closed.kind, closed.kind === "executed" ? closed.commitmentTx : "");
  await sleep(2500);
  await engine.handle({ type: "fill", vaultId: vault, orderId: "close", price: mark, size: Math.abs(pos.size), at: Date.now() });
}
console.log("Vault isFlat onchain:", await pub.readContract({ address: vault, abi: abiOf("Vault"), functionName: "isFlat", args: [] }));
console.log(`\nHyperCore: https://app.hyperliquid-testnet.xyz/explorer/address/${vault}`);
