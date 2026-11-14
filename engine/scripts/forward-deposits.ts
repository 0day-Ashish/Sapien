// Forwards deposits from the Deposit Account to their Vaults. Polls two sources and prints the engine's
// `deposit-landed` event for each:
//   - Base Sepolia (#6): `DepositForBurn` from the MockCctpForwarder; credits the depositor's Vault on HyperCore.
//   - Solana devnet (#22): real CCTP burns to the Deposit Account on HyperEVM; relays `receiveMessage`, then
//     credits the Vault in the hook data from the Deposit Account on HyperCore. Starts from the newest burn on first run.
// Progress is kept in engine/.state/deposits.json so a burn is never forwarded twice.
//
//   engine/.env.local: DEPOSIT_ACCOUNT_PRIVATE_KEY, ENGINE_OPERATOR_PRIVATE_KEY, optional SOLANA_RPC_URL
//   npm run deposits:forward            # keep polling
//   npm run deposits:forward -- --once  # one pass

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Address, createPublicClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Connection, PublicKey } from "@solana/web3.js";
import { baseSepolia } from "viem/chains";
import { forwardDeposit } from "../src/deposits/forward.js";
import { liveDepositPorts, readBurns } from "../src/deposits/live.js";
import { liveSolanaDepositPorts, readSolanaBurns } from "../src/deposits/live-solana.js";
import { depositForBurnPdas, forwardSolanaDeposit, type SolanaBurn } from "../src/deposits/solana.js";
import { AgentWalletStore } from "../src/service/agent-wallets.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const hyperEvm = json("../../contracts/deployments/hyperevm-testnet.json");
const base = json("../../contracts/deployments/base-sepolia.json");
const depositAccountAddress: Address = json("../config.json").depositAccount.address;

const depositAccount = privateKeyToAccount(process.env.DEPOSIT_ACCOUNT_PRIVATE_KEY as Hex);
if (depositAccount.address.toLowerCase() !== depositAccountAddress.toLowerCase()) throw new Error("DEPOSIT_ACCOUNT_PRIVATE_KEY doesn't match engine/config.json");
const config = {
  isTestnet: true,
  vaultFactory: hyperEvm.VaultFactory.address,
  depositAccount,
  engine: privateKeyToAccount(process.env.ENGINE_OPERATOR_PRIVATE_KEY as Hex),
  agentWallets: new AgentWalletStore(new URL("../.data/agent-wallets.json", import.meta.url).pathname),
};
const ports = liveDepositPorts(config);
const solanaPorts = liveSolanaDepositPorts(config);
const solana = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "finalized");
// No chain object: the OP-stack chain types make the client incompatible with a plain PublicClient.
const source = createPublicClient({ transport: http(baseSepolia.rpcUrls.default.http[0]) });
const messenger: Address = base.MockCctpForwarder.address;

const stateDir = new URL("../.state/", import.meta.url);
const stateFile = new URL("deposits.json", stateDir);
type State = {
  nextBlock: string;
  done: Record<string, unknown>;
  /** Solana: newest burn signature seen, and burns still waiting for their attestation. */
  solana?: { until?: string; pending: Record<string, SolanaBurn> };
};
const state: State = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"), (_, v) => (typeof v === "string" && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v))
  : { nextBlock: String(base.MockCctpForwarder.deployBlock), done: {} };
const save = () => {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, (_, v) => (typeof v === "bigint" ? `${v}n` : v), 2));
};

const SCAN_WINDOW = 2_000n;

async function pass() {
  const head = await source.getBlockNumber();
  // Window by window, saving the position after each, so a long catch-up survives an RPC error or a restart.
  for (let from = BigInt(state.nextBlock); from <= head; from = BigInt(state.nextBlock)) {
    const to = from + SCAN_WINDOW - 1n < head ? from + SCAN_WINDOW - 1n : head;
    for (const burn of await readBurns(source, messenger, from, to)) {
      if (state.done[burn.id]) continue;
      console.log(`burn ${burn.id}: ${burn.depositor} ${Number(burn.amount) / 1e6} USDC (maxFee ${Number(burn.maxFee) / 1e6})`);
      const result = await forwardDeposit(burn, depositAccountAddress, ports);
      console.log(result.status === "forwarded" ? { ...result, sent: String(result.sent) } : result);
      state.done[burn.id] = result.status === "forwarded" ? { vault: result.vault, sent: String(result.sent), event: result.event } : result;
      save();
    }
    state.nextBlock = String(to + 1n);
    save();
  }
}

async function solanaPass() {
  if (!state.solana) {
    // First run: start from now rather than replaying every devnet burn to HyperEVM.
    const [newest] = await solana.getSignaturesForAddress(depositForBurnPdas(PublicKey.default).remoteTokenMessenger, { limit: 1 }, "finalized");
    state.solana = { until: newest?.signature, pending: {} };
    return save();
  }
  const { burns, newest } = await readSolanaBurns(solana, state.solana.until);
  for (const b of burns) if (!state.done[b.id]) state.solana.pending[b.id] = b;
  state.solana.until = newest;
  save();
  for (const burn of Object.values(state.solana.pending)) {
    const result = await forwardSolanaDeposit(burn, depositAccountAddress, solanaPorts);
    if (result.status === "pending") continue;
    if (result.status === "skipped" && result.reason.startsWith("not minted")) {
      delete state.solana.pending[burn.id]; // someone else's burn to HyperEVM
      continue;
    }
    console.log(`solana burn ${burn.id}: ${burn.depositor} ${Number(burn.amount) / 1e6} USDC`);
    console.log(result.status === "forwarded" ? { ...result, sent: String(result.sent) } : result);
    state.done[burn.id] = result.status === "forwarded" ? { vault: result.vault, sent: String(result.sent), event: result.event } : result;
    delete state.solana.pending[burn.id];
    save();
  }
}

const once = process.argv.includes("--once");
do {
  await pass();
  await solanaPass().catch((e) => console.error("solana:", (e as Error).message));
  if (!once) await new Promise((r) => setTimeout(r, 5000));
} while (!once);
