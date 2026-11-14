// #16, last step: turn a real Overshoot from scripts/demo-overshoot.ts into a settled claim on the ProtectionFund (#15),
// so the payout shows on /payouts with evidence anyone can check on the explorer.
//
// Reads one evidence line from .data/overshoots.jsonl (the newest, or the one whose stop cloid is given), rebuilds the
// OvershootClaim the engine itself would submit (#15: positionId = stop cloid, filled size, market gap), and checks it
// against the live contracts first: Overshoot computed onchain, not already settled, the agent registered, the Fund's
// balance and its 10% cap. Without --send it stops there (no key needed).
//
//   npx tsx scripts/settle-overshoot.ts [stopCloid] [--agent momentum] [--send]
//   --send needs ENGINE_OPERATOR_PRIVATE_KEY in engine/.env.local: only the engine operator may call settle.
//   PROTECTION_FUND / AGENT_REGISTRY default to contracts/deployments/hyperevm-testnet.json.

import { readFileSync } from "node:fs";
import { createPublicClient, defineChain, http, keccak256, pad, parseAbi, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HyperEvmChain } from "../src/adapters/hyperevm.js";
import type { OvershootClaim } from "../src/ports.js";

const root = new URL("..", import.meta.url).pathname;
process.loadEnvFile(`${root}.env.local`);
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const send = args.includes("--send");
const agentId = flag("--agent") ?? "momentum";
const cloidArg = args.find((a) => a.startsWith("0x"));

const deployments = JSON.parse(readFileSync(`${root}../contracts/deployments/hyperevm-testnet.json`, "utf8"));
const fund = (process.env.PROTECTION_FUND ?? deployments.ProtectionFund.address) as Address;
const registry = (process.env.AGENT_REGISTRY ?? deployments.AgentRegistry.address) as Address;

type Evidence = {
  at: string;
  coin: string;
  side: "long" | "short";
  trigger: number;
  stopCloid: string;
  stopState: string;
  filledSize: number;
  avgFillPrice: number | null;
  overshootUsd: number;
  fills: { oid: number; px: string; sz: string; time: number; hash: string }[];
  explorer: string;
};
const lines = readFileSync(`${root}.data/overshoots.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Evidence);
const ev = cloidArg ? lines.find((l) => l.stopCloid === cloidArg) : lines.at(-1);
if (!ev) throw new Error(`No evidence${cloidArg ? ` for stop ${cloidArg}` : ""} in .data/overshoots.jsonl`);
if (ev.avgFillPrice === null || ev.filledSize === 0) throw new Error("That stop never filled: no Overshoot to claim");

// The account the stop protected: the payout goes there, on HyperEVM.
const victim = ev.explorer.split("/").at(-1) as Address;
const hl = await fetch("https://api.hyperliquid-testnet.xyz/info", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "clearinghouseState", user: victim }),
});
const accountValue = Number(((await hl.json()) as { marginSummary: { accountValue: string } }).marginSummary.accountValue);

const claim: OvershootClaim = {
  vaultId: victim,
  agentId,
  positionId: ev.stopCloid,
  triggerPrice: ev.trigger,
  fillPrice: ev.avgFillPrice,
  size: ev.filledSize,
  infrastructureFailure: false, // the stop was resting and filled: a market gap
  evidenceRef: JSON.stringify({ coin: ev.coin, side: ev.side, stopCloid: ev.stopCloid, stopState: ev.stopState, trigger: ev.trigger, fills: ev.fills, explorer: ev.explorer }),
  vaultValueUsdc: accountValue,
};

const hyperevm = defineChain({
  id: 998,
  name: "HyperEVM testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] } },
});
const pc = createPublicClient({ chain: hyperevm, transport: http() });
const fundAbi = parseAbi([
  "function engine() view returns (address)",
  "function fundBalance() view returns (uint256)",
  "function overshootOf(uint256 triggerPriceE8, uint256 fillPriceE8, uint256 sizeE8) view returns (uint256)",
  "function settlement(bytes32 positionId) view returns ((address vault, string agentId, uint64 epoch, uint64 settledAt, bool infrastructureFailure, uint256 triggerPriceE8, uint256 fillPriceE8, uint256 sizeE8, uint256 overshoot, uint256 fromReserve, uint256 fromBond, uint256 fromFund, bytes32 evidenceHash, string evidenceRef))",
]);
const registryAbi = parseAbi([
  "function agent(string agentId) view returns ((address builder, uint8 regimes, uint256 bond, uint64 unbondingEndsAt, uint32 ledVaults, uint256 ledValue))",
]);
const e8 = (x: number) => BigInt(Math.round(x * 1e8));
const usd = (x: bigint) => Number(x) / 1e6;
const positionId = pad(claim.positionId as Hex, { size: 32, dir: "right" });

const [engineOperator, fundBalance, overshoot, existing, agent] = await Promise.all([
  pc.readContract({ address: fund, abi: fundAbi, functionName: "engine" }),
  pc.readContract({ address: fund, abi: fundAbi, functionName: "fundBalance" }),
  pc.readContract({ address: fund, abi: fundAbi, functionName: "overshootOf", args: [e8(claim.triggerPrice), e8(claim.fillPrice), e8(claim.size)] }),
  pc.readContract({ address: fund, abi: fundAbi, functionName: "settlement", args: [positionId] }),
  pc.readContract({ address: registry, abi: registryAbi, functionName: "agent", args: [agentId] }).catch(() => undefined),
]);

console.log("Claim", { ...claim, evidenceRef: `${claim.evidenceRef.length} chars, keccak ${keccak256(toHex(claim.evidenceRef))}` });
console.log("Checks", {
  protectionFund: fund,
  engineOperator,
  overshootOnchainUsdc: usd(overshoot),
  overshootLoggedUsdc: Number(ev.overshootUsd.toFixed(6)),
  fundBalanceUsdc: usd(fundBalance),
  fundCapUsdc: Number((accountValue * 0.1).toFixed(6)),
  alreadySettled: existing.vault !== "0x0000000000000000000000000000000000000000",
  agentRegistered: !!agent && agent.builder !== "0x0000000000000000000000000000000000000000",
  agentBondUsdc: agent ? usd(agent.bond) : 0,
});
if (existing.vault !== "0x0000000000000000000000000000000000000000") throw new Error("Already settled: see /payouts");
if (!agent || agent.builder === "0x0000000000000000000000000000000000000000") throw new Error(`Agent ${agentId} isn't registered in the AgentRegistry: a market-gap claim slashes its Bond first. Pick a registered one with --agent.`);
if (overshoot === 0n) throw new Error("No Overshoot onchain");
if (!send) {
  console.log("Dry run. Add --send (with ENGINE_OPERATOR_PRIVATE_KEY) to settle.");
  process.exit(0);
}

const key = process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("Set ENGINE_OPERATOR_PRIVATE_KEY in engine/.env.local");
const operator = privateKeyToAccount(key);
if (operator.address.toLowerCase() !== engineOperator.toLowerCase()) throw new Error(`That key is ${operator.address}, not the ProtectionFund's engine ${engineOperator}`);
const chain = new HyperEvmChain({ mandateRegistry: deployments.MandateRegistry.address, decisionLog: deployments.DecisionLog.address, engine: operator, agentRegistry: registry, protectionFund: fund });
await chain.submitOvershootClaim(claim);
const s = await pc.readContract({ address: fund, abi: fundAbi, functionName: "settlement", args: [positionId] });
console.log("SETTLED", { positionId, overshoot: usd(s.overshoot), fromBond: usd(s.fromBond), fromFund: usd(s.fromFund), fromReserve: usd(s.fromReserve), paidTo: s.vault });
