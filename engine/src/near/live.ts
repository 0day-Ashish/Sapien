// Wires the live NEAR pieces for the scripts: the contract adapter, the HyperEVM ports and the binding service.

import { readFileSync } from "node:fs";
import type { PrivateKeyAccount } from "viem/accounts";
import { NearContract, nearConfigFromEnv } from "../adapters/near.js";
import type { AgentWalletStore } from "../service/agent-wallets.js";
import { liveEvmPorts } from "./evm.js";
import { JsonFileState } from "./state.js";
import { createVaultService, NearVaultStore, type VaultBinding } from "./vaults.js";

/** `root` is the engine/ directory (with a trailing slash). */
export function liveNear(root: string, agentWallets: AgentWalletStore, operator: PrivateKeyAccount, env: NodeJS.ProcessEnv = process.env) {
  const near = new NearContract(nearConfigFromEnv(env));
  const vaults = new NearVaultStore(new JsonFileState<Record<string, VaultBinding>>(`${root}.data/near-vaults.json`, () => ({})));
  const deployed = JSON.parse(readFileSync(`${root}../contracts/deployments/hyperevm-testnet.json`, "utf8"));
  const evm = liveEvmPorts({ operator, vaultFactory: deployed.VaultFactory.address, mandateRegistry: deployed.MandateRegistry.address });
  return { near, vaults, evm, service: createVaultService({ near, evm, agentWallets, store: vaults }) };
}
