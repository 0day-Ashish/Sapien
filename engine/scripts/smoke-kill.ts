// Testnet Kill Switch, end to end (#9): kill, then withdraw, against a running engine (npm run engine).
//   npm run smoke:kill                        sign the kill Mandate Version, ask the engine to close everything, wait for Flat
//   npm run smoke:kill -- --withdraw 1        then withdrawToEvm 1 USDC (HyperCore -> the Vault's HyperEVM address)
//   npm run smoke:kill -- --resume            then sign a new Mandate Version without the kill flag, so trading resumes
// engine/.env.local: RUNNER_VAULT, ENGINE_OPERATOR_PRIVATE_KEY (the Vault owner), MANDATE_REGISTRY, ENGINE_PORT.

import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { existsSync } from "node:fs";
import { type Address, createPublicClient, createWalletClient, type Hex, http, parseAbi, parseUnits, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hyperEvmTestnet } from "../src/adapters/hyperevm.js";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k} in engine/.env.local`);
  return v;
};

const vault = env("RUNNER_VAULT") as Address;
const registry = env("MANDATE_REGISTRY") as Address;
const owner = privateKeyToAccount(env("ENGINE_OPERATOR_PRIVATE_KEY") as Hex);
const engineUrl = `http://127.0.0.1:${process.env.ENGINE_PORT ?? "8787"}`;
const withdrawArg = process.argv.indexOf("--withdraw");
const WITHDRAW = withdrawArg > 0 ? parseUnits(process.argv[withdrawArg + 1]!, 6) : 0n;
const RESUME = process.argv.includes("--resume");
const USDC_EVM: Address = "0x2B3370eE501B4a559b57D449569354196457D8Ab";

const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
const wallet = createWalletClient({ account: owner, chain: hyperEvmTestnet, transport: http() });
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: true }) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: string) => console.log(`\n== ${s}`);
const explorer = (h: Hex) => `https://testnet.purrsec.com/tx/${h}`;

const registryAbi = parseAbi([
  "struct MandateVersion { bytes32 mandateHash; uint32 leverageCapE2; uint16 stopLossBps; uint16 drawdownCapBps; uint64 vetoThresholdUsdc; bool killFlag; uint64 signedAt; }",
  "function currentMandate(address vault) view returns (uint256 version, MandateVersion m)",
  "function signMandateVersion(address vault, bytes mandateJson, uint32 leverageCapE2, uint16 stopLossBps, uint16 drawdownCapBps, uint64 vetoThresholdUsdc, bool killFlag, bool scopeNotLoosened) returns (uint256)",
]);
const vaultAbi = parseAbi(["function isFlat() view returns (bool)", "function withdrawToEvm(uint64 amount)"]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function send(label: string, req: Parameters<typeof wallet.writeContract>[0]) {
  for (let attempt = 1; ; attempt++) {
    try {
      const hash = await wallet.writeContract(req);
      const r = await evm.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`${label} reverted`);
      console.log(`${label}: ${explorer(hash)}`);
      return hash;
    } catch (e) {
      if (attempt >= 4 || /reverted/.test((e as Error).message)) throw e;
      await sleep(3_000 * attempt); // testnet RPC rate limits
    }
  }
}

async function until<T>(what: string, fn: () => Promise<T | null>, ms: number): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v !== null) return v;
    await sleep(3_000);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const openPositions = async () =>
  (await info.clearinghouseState({ user: vault })).assetPositions.filter((p) => Number(p.position.szi) !== 0).map((p) => `${p.position.coin} ${p.position.szi}`);

step("1. Before");
const [version, caps] = await evm.readContract({ address: registry, abi: registryAbi, functionName: "currentMandate", args: [vault] });
console.log(`Vault ${vault}: Mandate v${version}, kill flag ${caps.killFlag}; open positions: ${(await openPositions()).join(", ") || "none"}`);

if (!caps.killFlag) {
  step("2. Sign the kill Mandate Version (recorded onchain; same JSON as frontend/lib/vault/kill.ts)");
  const json = {
    allowedAssets: [] as string[],
    leverageCap: caps.leverageCapE2 / 100,
    stopLossPct: caps.stopLossBps / 100,
    drawdownCapPct: caps.drawdownCapBps / 100,
    vetoThresholdUsdc: Number(caps.vetoThresholdUsdc) / 1e6,
    blackoutWindows: [],
    killFlag: true,
  };
  await send("signMandateVersion (kill)", {
    address: registry,
    abi: registryAbi,
    functionName: "signMandateVersion",
    args: [vault, toHex(JSON.stringify(json)), caps.leverageCapE2, caps.stopLossBps, caps.drawdownCapBps, caps.vetoThresholdUsdc, true, true],
  });
}

step("3. Kill Switch: the engine closes every position");
const res = await fetch(`${engineUrl}/vaults/${vault}/kill`, { method: "POST" });
console.log(`POST /kill -> ${res.status}`, JSON.stringify(await res.json()));
await until("no open positions", async () => ((await openPositions()).length === 0 ? true : null), 120_000);
await until("Vault reported Flat onchain", async () => ((await evm.readContract({ address: vault, abi: vaultAbi, functionName: "isFlat" })) ? true : null), 120_000);
const after = await info.clearinghouseState({ user: vault });
console.log(`Flat. Open positions: none; withdrawable ${after.withdrawable} USDC`);

if (WITHDRAW > 0n) {
  step(`4. withdrawToEvm ${Number(WITHDRAW) / 1e6} USDC`);
  const before = await evm.readContract({ address: USDC_EVM, abi: erc20, functionName: "balanceOf", args: [vault] });
  await send("withdrawToEvm", { address: vault, abi: vaultAbi, functionName: "withdrawToEvm", args: [WITHDRAW] });
  const landed = await until("USDC on HyperEVM", async () => {
    const b = await evm.readContract({ address: USDC_EVM, abi: erc20, functionName: "balanceOf", args: [vault] });
    return b >= before + WITHDRAW ? b : null;
  }, 120_000);
  console.log(`Vault's HyperEVM USDC: ${Number(landed) / 1e6}`);
}

if (RESUME) {
  step("5. Resume: a new Mandate Version without the kill flag (the Vault is Flat, so it takes effect at once)");
  const mandate = { allowedAssets: ["ETH", "BTC"], leverageCap: caps.leverageCapE2 / 100, stopLossPct: caps.stopLossBps / 100, drawdownCapPct: caps.drawdownCapBps / 100, vetoThresholdUsdc: Number(caps.vetoThresholdUsdc) / 1e6, blackoutWindows: [] };
  await send("signMandateVersion (resume)", {
    address: registry,
    abi: registryAbi,
    functionName: "signMandateVersion",
    args: [vault, toHex(JSON.stringify(mandate)), caps.leverageCapE2, caps.stopLossBps, caps.drawdownCapBps, caps.vetoThresholdUsdc, false, false],
  });
  const [v, m] = await evm.readContract({ address: registry, abi: registryAbi, functionName: "currentMandate", args: [vault] });
  console.log(`Mandate v${v} in force, kill flag ${m.killFlag}`);
}
