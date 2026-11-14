// Testnet smoke for #7: the withdrawal path no unit test can prove. Deploys a throwaway VaultFactory (current
// contracts/out build), creates a Vault owned by the engine operator, funds it on HyperCore from the Deposit
// Account, then withdraws: HyperCore -> HyperEVM (CoreWriter) -> CCTP V2 burn with forwarding -> minted on Base Sepolia.
//
//   engine/.env.local: ENGINE_OPERATOR_PRIVATE_KEY (HYPE on HyperEVM), DEPOSIT_ACCOUNT_PRIVATE_KEY (USDC on HyperCore)
//   cd contracts && forge build && cd ../engine && npm run smoke:withdraw

import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import { readFileSync } from "node:fs";
import { type Address, createPublicClient, createWalletClient, type Hex, http, padHex, parseAbi, parseEventLogs } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hyperEvmTestnet } from "../src/adapters/hyperevm.js";
import { liveDepositPorts } from "../src/deposits/live.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: string) => console.log(`\n== ${s}`);
async function until<T>(what: string, f: () => Promise<T | undefined | null | false>, timeoutMs: number, everyMs = 3000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await f();
    if (v) return v as T;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(everyMs);
  }
}

const AMOUNT_IN = 3_000_000n; // funded to the Vault (1 USDC goes to activation)
const WITHDRAW = 1_500_000n;
const USDC_EVM: Address = "0x2B3370eE501B4a559b57D449569354196457D8Ab";
const USDC_BASE: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const owner = privateKeyToAccount(process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex);
const depositAccount = privateKeyToAccount(process.env.DEPOSIT_ACCOUNT_PRIVATE_KEY as Hex);
const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
const wallet = createWalletClient({ account: owner, chain: hyperEvmTestnet, transport: http() });
const base = createPublicClient({ transport: http("https://sepolia.base.org") });
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: true }) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const factoryAbi = parseAbi(["function createVault(address agentWallet) returns (address)", "event VaultCreated(address indexed owner, address indexed vault, address agentWallet)"]);
const vaultAbi = parseAbi(["function withdrawToEvm(uint64 amount)", "function bridgeOut(uint256 amount, uint32 destinationDomain, bytes32 recipient, uint256 maxFee)"]);

async function send(address: Address, abi: any, functionName: string, args: unknown[]) {
  const hash = await wallet.writeContract({ address, abi, functionName, args } as any);
  const receipt = await evm.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  console.log(`${functionName}: tx ${hash}`);
  return receipt;
}

step("Deploy throwaway VaultFactory");
const artifact = JSON.parse(readFileSync(new URL("../../contracts/out/VaultFactory.sol/VaultFactory.json", import.meta.url), "utf8"));
const deployHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [owner.address] } as any);
const factory = (await evm.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;
console.log(`VaultFactory ${factory} (tx ${deployHash})`);

step("Create Vault");
const created = await send(factory, factoryAbi, "createVault", [privateKeyToAccount(generatePrivateKey()).address]);
const vault = parseEventLogs({ abi: factoryAbi, logs: created.logs, eventName: "VaultCreated" })[0]!.args.vault as Address;
console.log(`Vault ${vault}`);

step(`Fund Vault on HyperCore: ${Number(AMOUNT_IN) / 1e6} USDC from the Deposit Account`);
const ports = liveDepositPorts({ isTestnet: true, vaultFactory: factory, depositAccount, engine: owner });
await ports.sendFromDepositAccount(vault, AMOUNT_IN);
const perp = await until("Vault perp balance", async () => {
  const s = await info.clearinghouseState({ user: vault });
  return Number(s.withdrawable) > 0 ? s.withdrawable : null;
}, 60_000);
console.log(`Vault perp withdrawable: ${perp} USDC`);

step(`withdrawToEvm(${Number(WITHDRAW) / 1e6}): HyperCore perp -> spot -> HyperEVM`);
await send(vault, vaultAbi, "withdrawToEvm", [WITHDRAW]);
const evmBal = await until("USDC on the Vault's HyperEVM address", async () => {
  const b = await evm.readContract({ address: USDC_EVM, abi: erc20, functionName: "balanceOf", args: [vault] });
  return b >= WITHDRAW ? b : null;
}, 120_000);
console.log(`Vault HyperEVM USDC: ${Number(evmBal) / 1e6}`);

step("bridgeOut to Base Sepolia (CCTP V2 + forwarding)");
const quotes = (await (await fetch("https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/19/6?forward=true")).json()) as {
  finalityThreshold: number;
  minimumFee: number;
  forwardFee: { high: number };
}[];
const q = quotes.find((x) => x.finalityThreshold === 2000)!;
const maxFee = (WITHDRAW * BigInt(Math.round(q.minimumFee * 100)) + 999_999n) / 1_000_000n + BigInt(q.forwardFee.high);
const baseBefore = await base.readContract({ address: USDC_BASE, abi: erc20, functionName: "balanceOf", args: [owner.address] });
const burn = await send(vault, vaultAbi, "bridgeOut", [WITHDRAW, 6, padHex(owner.address, { size: 32 }), maxFee]);
console.log(`maxFee ${Number(maxFee) / 1e6} USDC, recipient ${owner.address} on Base Sepolia`);

step("Wait for Circle to attest and mint on Base Sepolia");
let last = "";
const mintTx = await until("mint on Base Sepolia", async () => {
  const res = await fetch(`https://iris-api-sandbox.circle.com/v2/messages/19?transactionHash=${burn.transactionHash}`);
  if (!res.ok) return null;
  const m = ((await res.json()) as { messages?: Record<string, unknown>[] }).messages?.[0];
  const now = `${m?.status}/${m?.forwardState}/${m?.delayReason ?? ""}`;
  if (now !== last) console.log(`  ${now}`);
  last = now;
  return (m?.destinationMintTxHash as string) || null;
}, 20 * 60_000, 10_000);
const baseAfter = await base.readContract({ address: USDC_BASE, abi: erc20, functionName: "balanceOf", args: [owner.address] });
console.log(`Minted: tx ${mintTx}. Recipient +${Number(baseAfter - baseBefore) / 1e6} USDC on Base Sepolia`);
