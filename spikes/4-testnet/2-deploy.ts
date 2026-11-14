// Step 2: deploy SpikeAccount on HyperEVM testnet. Its address is also its HyperCore account address.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { evm, owner, ownerEvm, record, save, SPIKE_ABI, state } from "./lib.ts";

if (state().contract && !process.argv.includes("--force")) {
  console.log("Already deployed:", state().contract, "(use --force to redeploy)");
  process.exit(0);
}

const dir = new URL(".", import.meta.url).pathname;
execFileSync("forge", ["build"], { cwd: dir, stdio: "inherit" });
const artifact = JSON.parse(readFileSync(`${dir}out/SpikeAccount.sol/SpikeAccount.json`, "utf8"));

const hash = await ownerEvm().deployContract({ abi: SPIKE_ABI, bytecode: artifact.bytecode.object as Hex });
const receipt = await evm.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) throw new Error(`deploy failed: ${hash}`);

save({ contract: receipt.contractAddress, deployTx: hash });
record("2.deploy", { contract: receipt.contractAddress, tx: hash, gasUsed: receipt.gasUsed.toString(), owner: owner().address });
