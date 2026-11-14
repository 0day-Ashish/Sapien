// Live HyperEVM ports for the NEAR flows, all signed by the engine operator: it is the Vault's engine and, on testnet,
// also the owner of every Vault it creates for a NEAR account (see vaults.ts), so it creates Vaults, publishes
// Mandates and withdraws on the owner's behalf.

import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { type Address, createPublicClient, createWalletClient, http, parseAbi, parseEventLogs, toHex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { hyperEvmTestnet } from "../adapters/hyperevm.js";
import type { WithdrawalPorts } from "./withdrawals.js";
import type { VaultEvmPorts } from "./vaults.js";

export type LiveEvmConfig = {
  isTestnet?: boolean;
  /** The Execution Engine operator. */
  operator: PrivateKeyAccount;
  vaultFactory: Address;
  mandateRegistry: Address;
};

const factoryAbi = parseAbi(["function createVault(address agentWallet) returns (address)", "event VaultCreated(address indexed owner, address indexed vault, address agentWallet)"]);
const registryAbi = parseAbi([
  "function signMandateVersion(address vault, bytes mandateJson, uint32 leverageCapE2, uint16 stopLossBps, uint16 drawdownCapBps, uint64 vetoThresholdUsdc, bool killFlag, bool scopeNotLoosened) returns (uint256)",
]);
const vaultAbi = parseAbi(["function agentWallet() view returns (address)", "function isFlat() view returns (bool)", "function withdrawToEvm(uint64 amount)"]);

export function liveEvmPorts(c: LiveEvmConfig): VaultEvmPorts & WithdrawalPorts {
  const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
  const wallet = createWalletClient({ account: c.operator, chain: hyperEvmTestnet, transport: http() });
  const info = new InfoClient({ transport: new HttpTransport({ isTestnet: c.isTestnet ?? true }) });

  async function send(hash: `0x${string}`, what: string) {
    const receipt = await evm.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${what} reverted: ${hash}`);
    return receipt;
  }

  return {
    async createVault(agentWallet) {
      const hash = await wallet.writeContract({ address: c.vaultFactory, abi: factoryAbi, functionName: "createVault", args: [agentWallet] });
      const receipt = await send(hash, "VaultFactory.createVault");
      const [created] = parseEventLogs({ abi: factoryAbi, eventName: "VaultCreated", logs: receipt.logs });
      if (!created) throw new Error(`No VaultCreated in ${hash}`);
      return created.args.vault;
    },
    agentWalletOf: (vault) => evm.readContract({ address: vault, abi: vaultAbi, functionName: "agentWallet" }),
    async publishMandate(vault, mandateJson, caps) {
      // The kill flag is never set here (the NEAR Kill Switch owns it) and the scope isn't claimed tighter, so a version
      // that changes assets or blackout windows waits until the Vault is Flat, unless it's the first one.
      const hash = await wallet.writeContract({
        address: c.mandateRegistry,
        abi: registryAbi,
        functionName: "signMandateVersion",
        args: [vault, toHex(mandateJson), caps.leverageCapE2, caps.stopLossBps, caps.drawdownCapBps, caps.vetoThresholdUsdc, false, false],
      });
      await send(hash, "MandateRegistry.signMandateVersion");
      return hash;
    },
    isFlat: (vault: Address) => evm.readContract({ address: vault, abi: vaultAbi, functionName: "isFlat" }),
    async withdrawable(vault: Address) {
      const perp = await info.clearinghouseState({ user: vault });
      return BigInt(Math.floor(Number(perp.withdrawable) * 1e6));
    },
    async withdrawToEvm(vault: Address, amount: bigint) {
      const hash = await wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "withdrawToEvm", args: [amount] });
      await send(hash, "Vault.withdrawToEvm");
    },
  };
}
