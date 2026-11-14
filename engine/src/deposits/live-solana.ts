// Live SolanaDepositPorts and burn reader (#22): devnet burns to HyperEVM, Circle's sandbox attestation API,
// MessageTransmitterV2 and CoreDepositWallet on HyperEVM testnet, then the Deposit Account on HyperCore.

import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { type Connection, PublicKey } from "@solana/web3.js";
import { type Address, createPublicClient, createWalletClient, type Hex, http, parseAbi } from "viem";
import { hyperEvmTestnet } from "../adapters/hyperevm.js";
import { type LiveDepositConfig, liveDepositPorts } from "./live.js";
import {
  decodeBurnMessage,
  decodeDepositForBurnWithHook,
  depositForBurnPdas,
  SOLANA_DOMAIN,
  type SolanaBurn,
  type SolanaDepositPorts,
  TOKEN_MESSENGER_MINTER_V2,
} from "./solana.js";

/** HyperEVM testnet: Circle's MessageTransmitterV2, CoreDepositWallet and USDC. */
export const HYPEREVM_CCTP = {
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  coreDepositWallet: "0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206",
  usdc: "0x2B3370eE501B4a559b57D449569354196457D8Ab",
} as const satisfies Record<string, Address>;
export const IRIS_SANDBOX = "https://iris-api-sandbox.circle.com";

const PERPS_DEX = 0;
const factoryAbi = parseAbi(["function isVault(address) view returns (bool)"]);
const transmitterAbi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
  "function usedNonces(bytes32 nonce) view returns (uint256)",
]);
const usdcAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
const depositWalletAbi = parseAbi(["function depositFor(address recipient, uint256 amount, uint32 destinationDex)"]);

type IrisMessage = { message: Hex; attestation: Hex | "PENDING"; status: string };

/** The attested message for a Solana burn, or null until Circle has attested it. */
export async function fetchAttestation(burnSignature: string, fetchFn: typeof fetch = fetch): Promise<{ message: Hex; attestation: Hex } | null> {
  const res = await fetchFn(`${IRIS_SANDBOX}/v2/messages/${SOLANA_DOMAIN}?transactionHash=${burnSignature}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Iris ${res.status}`);
  const m = ((await res.json()) as { messages?: IrisMessage[] }).messages?.[0];
  return m && m.status === "complete" && m.attestation !== "PENDING" ? { message: m.message, attestation: m.attestation } : null;
}

export function liveSolanaDepositPorts(config: LiveDepositConfig): SolanaDepositPorts {
  const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
  const engineWallet = createWalletClient({ account: config.engine, chain: hyperEvmTestnet, transport: http() });
  const depositWallet = createWalletClient({ account: config.depositAccount, chain: hyperEvmTestnet, transport: http() });
  const core = liveDepositPorts(config);
  const info = new InfoClient({ transport: new HttpTransport({ isTestnet: config.isTestnet }) });
  const confirm = async (what: string, hash: Hex) => {
    const r = await evm.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${what} reverted: ${hash}`);
    console.log(`  ${what}: ${hash}`);
  };

  return {
    isVault: (vault) => evm.readContract({ address: config.vaultFactory, abi: factoryAbi, functionName: "isVault", args: [vault] }),
    async relay(burnId) {
      const attested = await fetchAttestation(burnId);
      if (!attested) return null;
      const { nonce } = decodeBurnMessage(attested.message);
      const used = await evm.readContract({ address: HYPEREVM_CCTP.messageTransmitter, abi: transmitterAbi, functionName: "usedNonces", args: [nonce] });
      if (used === 0n) {
        const hash = await engineWallet.writeContract({
          address: HYPEREVM_CCTP.messageTransmitter,
          abi: transmitterAbi,
          functionName: "receiveMessage",
          args: [attested.message, attested.attestation],
        });
        await confirm("receiveMessage", hash);
      }
      return { message: attested.message };
    },
    isActivated: core.isActivated,
    sendFromDepositAccount: core.sendFromDepositAccount,
    async depositToCore(amount) {
      // Testnet: CoreDepositWallet drops credits to accounts without mainnet state (seen twice, 6 USDC lost), and the
      // Deposit Account is testnet-only. The USDC stays on HyperEVM and the Vault is credited from the Deposit
      // Account's HyperCore float instead, as with the Base Sepolia mock.
      if (config.isTestnet) return;
      const approve = await depositWallet.writeContract({ address: HYPEREVM_CCTP.usdc, abi: usdcAbi, functionName: "approve", args: [HYPEREVM_CCTP.coreDepositWallet, amount] });
      await confirm("approve", approve);
      const perp = async () => BigInt(Math.round(Number((await info.clearinghouseState({ user: config.depositAccount.address })).withdrawable) * 1e6));
      const before = await perp();
      const hash = await depositWallet.writeContract({
        address: HYPEREVM_CCTP.coreDepositWallet,
        abi: depositWalletAbi,
        functionName: "depositFor",
        args: [config.depositAccount.address, amount, PERPS_DEX],
      });
      await confirm("CoreDepositWallet.depositFor", hash);
      // HyperCore credits it a block or so later.
      for (let i = 0; i < 30 && (await perp()) < before + amount; i++) await new Promise((r) => setTimeout(r, 2000));
      if ((await perp()) < before + amount) throw new Error(`Deposit Account not credited on HyperCore after ${hash}`);
    },
    registerAgentWallet: core.registerAgentWallet,
  };
}

/**
 * Successful `deposit_for_burn_with_hook` burns to HyperEVM after `until` (a signature), oldest first. Every devnet burn
 * to HyperEVM passes the domain-19 remote token messenger PDA, so its signature list is the feed.
 */
export async function readSolanaBurns(conn: Connection, until?: string): Promise<{ burns: SolanaBurn[]; newest?: string }> {
  const feed = depositForBurnPdas(PublicKey.default).remoteTokenMessenger;
  const sigs = await conn.getSignaturesForAddress(feed, { until, limit: 1000 }, "finalized");
  const burns: SolanaBurn[] = [];
  for (const s of [...sigs].reverse()) {
    if (s.err) continue;
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "finalized" });
    if (!tx) continue;
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
    for (const ix of tx.transaction.message.compiledInstructions) {
      if (!keys.get(ix.programIdIndex)?.equals(TOKEN_MESSENGER_MINTER_V2)) continue;
      const params = decodeDepositForBurnWithHook(ix.data);
      if (params) burns.push({ ...params, id: s.signature, depositor: keys.get(ix.accountKeyIndexes[0]!)!.toBase58() });
    }
  }
  return { burns, newest: sigs[0]?.signature ?? until };
}
