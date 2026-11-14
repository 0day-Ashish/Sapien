// Live DepositPorts and burn reader: VaultFactory on HyperEVM, the Deposit Account on HyperCore, and
// `DepositForBurn` logs on Base Sepolia (from our MockCctpForwarder today, TokenMessengerV2 once real CCTP works).

import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { type Address, createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseAbiItem, type PublicClient } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { hyperEvmTestnet } from "../adapters/hyperevm.js";
import type { Burn, DepositPorts } from "./forward.js";

export type LiveDepositConfig = {
  isTestnet: boolean;
  vaultFactory: Address;
  /** Signs HyperCore transfers out of the Deposit Account. */
  depositAccount: PrivateKeyAccount;
  /** The Execution Engine operator: the only account a Vault accepts `registerAgentWallet` from. */
  engine: PrivateKeyAccount;
};

const factoryAbi = parseAbi(["function depositTargetOf(address owner) view returns (address)"]);
const vaultAbi = parseAbi(["function agentWallet() view returns (address)", "function registerAgentWallet(address agentWallet_)"]);
const ZERO = "0x0000000000000000000000000000000000000000";

export function liveDepositPorts(config: LiveDepositConfig): DepositPorts {
  const transport = new HttpTransport({ isTestnet: config.isTestnet });
  const info = new InfoClient({ transport });
  const exchange = new ExchangeClient({ transport, wallet: config.depositAccount });
  const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
  const wallet = createWalletClient({ account: config.engine, chain: hyperEvmTestnet, transport: http() });
  const usd = (subunits: bigint) => formatUnits(subunits, 6);

  return {
    async depositTargetOf(depositor) {
      const vault = await evm.readContract({ address: config.vaultFactory, abi: factoryAbi, functionName: "depositTargetOf", args: [depositor] });
      return vault === ZERO ? null : vault;
    },
    async isActivated(account) {
      return (await info.userRole({ user: account })).role !== "missing";
    },
    async sendFromDepositAccount(to, amount) {
      // Real CCTP credits the Deposit Account's perp balance. With the mock there is no hook, so any shortfall is
      // moved over from its spot float first.
      const perp = await info.clearinghouseState({ user: config.depositAccount.address });
      const withdrawable = BigInt(Math.floor(Number(perp.withdrawable) * 1e6));
      if (withdrawable < amount) await exchange.usdClassTransfer({ amount: usd(amount - withdrawable), toPerp: true });
      await exchange.usdSend({ destination: to, amount: usd(amount) });
    },
    async registerAgentWallet(vault) {
      const agent = await evm.readContract({ address: vault, abi: vaultAbi, functionName: "agentWallet" });
      const hash = await wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "registerAgentWallet", args: [agent] });
      const receipt = await evm.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`registerAgentWallet reverted: ${hash}`);
    },
  };
}

const depositForBurn = parseAbiItem(
  "event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)",
);

/** Burns in [fromBlock, toBlock], read in chunks: public Base Sepolia RPCs cap getLogs at 200 blocks. */
export async function readBurns(client: PublicClient, messenger: Address, fromBlock: bigint, toBlock: bigint, chunk = 200n): Promise<Burn[]> {
  const burns: Burn[] = [];
  for (let from = fromBlock; from <= toBlock; from += chunk) {
    const to = from + chunk - 1n < toBlock ? from + chunk - 1n : toBlock;
    const logs = await client.getLogs({ address: messenger, event: depositForBurn, fromBlock: from, toBlock: to });
    for (const l of logs) {
      burns.push({
        id: `${l.transactionHash}:${l.logIndex}`,
        depositor: l.args.depositor!,
        amount: l.args.amount!,
        maxFee: l.args.maxFee!,
        hookData: l.args.hookData!,
      });
    }
  }
  return burns;
}
