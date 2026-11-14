// Step 0: keys and balances. Generates a fresh Agent Wallet key (the docs say never reuse agent addresses).
import { formatEther } from "viem";
import { agent, ensureKey, evm, info, owner, record, snapshot } from "./lib.ts";

const newOwner = process.argv.includes("--new-owner");
if (newOwner && ensureKey("OWNER_PRIVATE_KEY")) console.log("Generated a fresh OWNER key into .env");
if (ensureKey("AGENT_PRIVATE_KEY")) console.log("Generated a fresh AGENT key into .env");

if (!process.env.OWNER_PRIVATE_KEY) {
  console.log(
    "\nNo OWNER_PRIVATE_KEY yet. Either paste a funded testnet key into spikes/4-testnet/.env,\n" +
      "or run `npm run setup -- --new-owner` and fund the printed address.",
  );
  console.log("Agent Wallet:", agent().address);
  process.exit(0);
}

const o = owner().address;
const a = agent().address;
console.log("Owner :", o);
console.log("Agent :", a);

const [core, hype] = await Promise.all([snapshot(o), evm.getBalance({ address: o })]);
console.log("Owner on HyperCore:", JSON.stringify(core, null, 2));
console.log("Owner HYPE on HyperEVM:", formatEther(hype));

const agentRole = await info.userRole({ user: a });
record("0.agentRoleBeforeApproval", agentRole);

const needs: string[] = [];
if (Number(core.withdrawable) < 35 && !core.spot.some((b) => b.coin === "USDC" && Number(b.total) >= 35))
  needs.push("~40+ testnet USDC on HyperCore (faucet: https://app.hyperliquid-testnet.xyz/drip)");
if (hype === 0n) needs.push("a little HYPE on HyperEVM for gas (or run `npm run gas` once the owner has USDC)");
console.log(needs.length ? `\nStill needed:\n- ${needs.join("\n- ")}` : "\nOwner is funded. Next: npm run deploy");
