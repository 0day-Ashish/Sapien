// Live DepositPorts: Vault checks on HyperEVM and the Deposit Account's transfers on HyperCore.

import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { type Address, createPublicClient, createWalletClient, formatUnits, http, parseAbi } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { hyperEvmTestnet } from "../adapters/hyperevm.js";
import type { AgentWalletStore } from "../service/agent-wallets.js";
import type { DepositPorts } from "./forward.js";

export type LiveDepositConfig = {
  isTestnet: boolean;
  /** Signs HyperCore transfers out of the Deposit Account. */
  depositAccount: PrivateKeyAccount;
  /** The Execution Engine operator: the only account a Vault accepts `registerAgentWallet` from. */
  engine: PrivateKeyAccount;
  /** Records which Vault each engine-issued Agent Wallet trades for (#38). */
  agentWallets?: AgentWalletStore;
};

const vaultAbi = parseAbi(["function engine() view returns (address)", "function agentWallet() view returns (address)", "function registerAgentWallet(address agentWallet_)"]);

export function liveDepositPorts(config: LiveDepositConfig): DepositPorts {
  const transport = new HttpTransport({ isTestnet: config.isTestnet });
  const info = new InfoClient({ transport });
  const exchange = new ExchangeClient({ transport, wallet: config.depositAccount });
  const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
  const wallet = createWalletClient({ account: config.engine, chain: hyperEvmTestnet, transport: http() });
  const usd = (subunits: bigint) => formatUnits(subunits, 6);

  return {
    async isVault(vault) {
      // A Vault's engine is our operator. An address with no code (the smoke deposit's 0x…dead) reverts: not a Vault.
      try {
        const engine = await evm.readContract({ address: vault, abi: vaultAbi, functionName: "engine" });
        return engine.toLowerCase() === config.engine.address.toLowerCase();
      } catch {
        return false;
      }
    },
    async isActivated(account) {
      return (await info.userRole({ user: account })).role !== "missing";
    },
    async sendFromDepositAccount(to, amount) {
      // Testnet has no bridge hook, so the Deposit Account's perp balance is topped up from its spot float first.
      const perp = await info.clearinghouseState({ user: config.depositAccount.address });
      const withdrawable = BigInt(Math.floor(Number(perp.withdrawable) * 1e6));
      if (withdrawable < amount) await exchange.usdClassTransfer({ amount: usd(amount - withdrawable), toPerp: true });
      await exchange.usdSend({ destination: to, amount: usd(amount) });
    },
    async registerAgentWallet(vault) {
      const agent = await evm.readContract({ address: vault, abi: vaultAbi, functionName: "agentWallet" });
      try {
        config.agentWallets?.bind(vault, agent);
      } catch (e) {
        // Not engine-issued (or already bound elsewhere): the deposit is still credited, the Vault just can't trade.
        console.warn(`Vault ${vault}: Agent Wallet ${agent} not bound: ${(e as Error).message}`);
      }
      const hash = await wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "registerAgentWallet", args: [agent] });
      const receipt = await evm.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`registerAgentWallet reverted: ${hash}`);
    },
  };
}
