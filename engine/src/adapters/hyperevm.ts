// HyperEVM implementation of the ChainPort, against Lane A's contracts:
// MandateRegistry (Mandate Versions), Vault (Flat reporting) and DecisionLog (Decision Commitments).
// vaultId is the Vault contract's address.

import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  keccak256,
  pad,
  parseAbi,
  parseAbiItem,
  type PublicClient,
  type Transport,
  type WalletClient,
  toHex,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import type { AgentId, VaultId } from "../events.js";
import type { ChainPort, DecisionCommitment, EpochSettlement, Mandate, OvershootClaim } from "../ports.js";
import { toPpm } from "../premium.js";

export const hyperEvmTestnet = defineChain({
  id: 998,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] } },
});

export type HyperEvmChainConfig = {
  mandateRegistry: Address;
  decisionLog: Address;
  /** The Execution Engine operator: the only account the Vaults and the DecisionLog accept writes from. */
  engine: PrivateKeyAccount;
  chain?: Chain;
  rpcUrl?: string;
  /** The AgentRegistry (#12). Without it, every agent counts as above its Bond Minimum. */
  agentRegistry?: Address;
  /** The ProtectionFund (#15): settles Overshoot claims and holds the Coverage Ratio. Without it, claims throw. */
  protectionFund?: Address;
  /** The FeeRouter (#17): Epoch fees and premiums. Without it, Epoch settlement only reports the Fund cap's basis. */
  feeRouter?: Address;
  /** Wait between asking a Vault for its fees and paying them out (HyperCore credits HyperEVM a block later). */
  feeLandingDelayMs?: number;
};

const feeRouterAbi = parseAbi([
  "function settleEpoch(address vault, uint64 epoch, uint256 value, int256 netFlows, string agentId, uint32 premiumRatePpm, uint256 notional)",
  "function distribute(address vault) returns (uint256)",
]);

const protectionFundAbi = parseAbi([
  "struct Claim { address vault; string agentId; bytes32 positionId; uint256 triggerPriceE8; uint256 fillPriceE8; uint256 sizeE8; bool infrastructureFailure; bytes32 evidenceHash; string evidenceRef; }",
  "function settle(Claim[] claims)",
  "function currentEpoch() view returns (uint256)",
  "function epochStartValue(address vault, uint256 epoch) view returns (uint256)",
  "function reportEpochValue(address vault, uint256 value)",
  "function reportExposure(uint256 exposure)",
]);

/** A price or size as the ProtectionFund takes it: 8 decimals, rounded to the nearest unit. */
export const toE8 = (x: number): bigint => BigInt(Math.round(x * 1e8));
const toUsdc = (x: number): bigint => BigInt(Math.round(x * 1e6));

const registryAbi = [
  {
    type: "function",
    name: "currentMandate",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [
      { name: "version", type: "uint256" },
      {
        name: "m",
        type: "tuple",
        components: [
          { name: "mandateHash", type: "bytes32" },
          { name: "leverageCapE2", type: "uint32" },
          { name: "stopLossBps", type: "uint16" },
          { name: "drawdownCapBps", type: "uint16" },
          { name: "vetoThresholdUsdc", type: "uint64" },
          { name: "killFlag", type: "bool" },
          { name: "signedAt", type: "uint64" },
        ],
      },
    ],
  },
  { type: "function", name: "pendingVersion", stateMutability: "view", inputs: [{ name: "vault", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "activatePending", stateMutability: "nonpayable", inputs: [{ name: "vault", type: "address" }], outputs: [] },
] as const;

const mandateSignedEvent = parseAbiItem(
  "event MandateVersionSigned(address indexed vault, uint256 indexed version, bytes32 mandateHash, bytes mandateJson)",
);

const vaultAbi = [
  { type: "function", name: "reportFlat", stateMutability: "nonpayable", inputs: [{ name: "isFlat_", type: "bool" }], outputs: [] },
  { type: "function", name: "isFlat", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

const decisionLogAbi = [
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "agentId", type: "string" },
      { name: "decisionHash", type: "bytes32" },
    ],
    outputs: [{ name: "index", type: "uint256" }],
  },
] as const;

const agentRegistryAbi = [
  { type: "function", name: "meetsBondMinimum", stateMutability: "view", inputs: [{ name: "agentId", type: "string" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "reportLead",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "agentId", type: "string" },
      { name: "vaultValue", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/** The signed Mandate JSON, as the frontend writes it (frontend/lib/mandate/schema.ts). Blackout times are unix seconds. */
type MandateJson = {
  allowedAssets: string[];
  leverageCap: number;
  stopLossPct: number;
  drawdownCapPct: number;
  vetoThresholdUsdc: number;
  blackoutWindows: { event?: string; start: number; end: number }[];
};

export class HyperEvmChain implements ChainPort {
  private publicClient: PublicClient<Transport, Chain>;
  private wallet: WalletClient<Transport, Chain, PrivateKeyAccount>;
  /** Verified Mandate Versions never change, so each is fetched and checked once. */
  private mandates = new Map<string, Mandate>();

  constructor(private config: HyperEvmChainConfig) {
    const chain = config.chain ?? hyperEvmTestnet;
    const transport = http(config.rpcUrl);
    this.publicClient = createPublicClient({ chain, transport });
    this.wallet = createWalletClient({ account: config.engine, chain, transport });
  }

  async currentMandate(vaultId: VaultId): Promise<Mandate> {
    const vault = vaultId as Address;
    const [version, m] = await this.publicClient.readContract({
      address: this.config.mandateRegistry,
      abi: registryAbi,
      functionName: "currentMandate",
      args: [vault],
    });
    if (version === 0n) throw new Error("The Vault has no effective Mandate Version yet");

    const key = `${vault.toLowerCase()}:${version}`;
    const cached = this.mandates.get(key);
    if (cached) return { ...cached, killFlag: m.killFlag };

    const json = await this.signedJson(vault, version, m.signedAt);
    if (keccak256(json) !== m.mandateHash) throw new Error(`Mandate v${version} JSON does not match its onchain hash`);
    const parsed = JSON.parse(Buffer.from(json.slice(2), "hex").toString("utf8")) as MandateJson;

    // Lane A's rule: reject a version whose numeric caps disagree with its JSON.
    const mismatch = [
      ["leverageCap", Math.round(parsed.leverageCap * 100), m.leverageCapE2],
      ["stopLossPct", Math.round(parsed.stopLossPct * 100), m.stopLossBps],
      ["drawdownCapPct", Math.round(parsed.drawdownCapPct * 100), m.drawdownCapBps],
      ["vetoThresholdUsdc", BigInt(Math.round(parsed.vetoThresholdUsdc * 1e6)), m.vetoThresholdUsdc],
    ].find(([, fromJson, onchain]) => BigInt(fromJson as number | bigint) !== BigInt(onchain as number | bigint));
    if (mismatch) throw new Error(`Mandate v${version}: ${mismatch[0]} in the JSON disagrees with the onchain cap`);

    const mandate: Mandate = {
      version: Number(version),
      allowedAssets: parsed.allowedAssets,
      leverageCap: m.leverageCapE2 / 100,
      stopLossPct: m.stopLossBps / 100,
      drawdownCapPct: m.drawdownCapBps / 100,
      blackoutWindows: (parsed.blackoutWindows ?? []).map((w) => ({ start: w.start * 1000, end: w.end * 1000 })),
      vetoThresholdUsdc: Number(m.vetoThresholdUsdc) / 1e6,
      killFlag: m.killFlag,
    };
    this.mandates.set(key, mandate);
    return mandate;
  }

  async commitDecision(c: DecisionCommitment) {
    const hash = await this.wallet.writeContract({
      address: this.config.decisionLog,
      abi: decisionLogAbi,
      functionName: "commit",
      args: [c.vaultId as Address, c.agentId, c.decisionHash as Hex],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`DecisionLog.commit reverted: ${hash}`);
    return { txHash: hash };
  }

  async reportFlat(vaultId: VaultId) {
    const vault = vaultId as Address;
    const hash = await this.wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "reportFlat", args: [true] });
    await this.publicClient.waitForTransactionReceipt({ hash });
    // A looser Mandate Version waiting for Flat can take effect now.
    const pending = await this.publicClient.readContract({ address: this.config.mandateRegistry, abi: registryAbi, functionName: "pendingVersion", args: [vault] });
    if (pending !== 0n) {
      const tx = await this.wallet.writeContract({ address: this.config.mandateRegistry, abi: registryAbi, functionName: "activatePending", args: [vault] });
      await this.publicClient.waitForTransactionReceipt({ hash: tx });
    }
  }

  async submitOvershootClaim(claim: OvershootClaim): Promise<void> {
    const fund = this.protectionFund();
    const vault = claim.vaultId as Address;
    // The Fund's cap is 10% of the Vault's value at Epoch start. Until Epoch ticks report it (#17), the value now stands in.
    const epoch = await this.publicClient.readContract({ address: fund, abi: protectionFundAbi, functionName: "currentEpoch" });
    const startValue = await this.publicClient.readContract({ address: fund, abi: protectionFundAbi, functionName: "epochStartValue", args: [vault, epoch] });
    if (startValue === 0n) await this.write(fund, "reportEpochValue", [vault, toUsdc(claim.vaultValueUsdc)]);
    await this.write(fund, "settle", [
      [
        {
          vault,
          agentId: claim.agentId,
          positionId: pad(claim.positionId as Hex, { size: 32, dir: "right" }),
          triggerPriceE8: toE8(claim.triggerPrice),
          fillPriceE8: toE8(claim.fillPrice),
          sizeE8: toE8(claim.size),
          infrastructureFailure: claim.infrastructureFailure,
          evidenceHash: keccak256(toHex(claim.evidenceRef)),
          evidenceRef: claim.evidenceRef,
        },
      ],
    ]);
  }

  /** The ProtectionFund's current Epoch (24h from its deployment): the engine settles on its boundaries. */
  async currentEpoch(): Promise<number> {
    return Number(await this.publicClient.readContract({ address: this.protectionFund(), abi: protectionFundAbi, functionName: "currentEpoch" }));
  }

  async reportExposure(totalUsdc: number): Promise<void> {
    if (!this.config.protectionFund) return;
    await this.write(this.config.protectionFund, "reportExposure", [toUsdc(totalUsdc)]);
  }

  private protectionFund(): Address {
    if (!this.config.protectionFund) throw new Error("No ProtectionFund configured (#15)");
    return this.config.protectionFund;
  }

  private async write(address: Address, functionName: "settle" | "reportEpochValue" | "reportExposure", args: readonly unknown[]) {
    const hash = await this.wallet.writeContract({ address, abi: protectionFundAbi, functionName, args } as never);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`ProtectionFund.${functionName} reverted: ${hash}`);
    return hash;
  }

  /**
   * Reports the Vault's Epoch-start value (the Protection Fund cap's basis), then settles its fees and premiums on the
   * FeeRouter, which asks the Vault to move them to HyperEVM; once that lands, pays them out. Charges whose USDC
   * hasn't landed are paid by a later call (distribute runs first too).
   */
  async settleEpoch(s: EpochSettlement): Promise<void> {
    const vault = s.vaultId as Address;
    if (this.config.protectionFund) await this.write(this.config.protectionFund, "reportEpochValue", [vault, toUsdc(s.valueUsdc)]);
    const router = this.config.feeRouter;
    if (!router) throw new Error("No FeeRouter configured (#17)");
    await this.writeFeeRouter(router, "distribute", [vault]).catch(() => {});
    await this.writeFeeRouter(router, "settleEpoch", [
      vault,
      BigInt(s.epoch),
      toUsdc(s.valueUsdc),
      toUsdc(s.netFlowsUsdc),
      s.agentId ?? "",
      toPpm(s.premiumRate),
      toUsdc(s.tradedNotionalUsdc),
    ]);
    await new Promise((r) => setTimeout(r, this.config.feeLandingDelayMs ?? 10_000));
    await this.writeFeeRouter(router, "distribute", [vault]);
  }

  private async writeFeeRouter(address: Address, functionName: "settleEpoch" | "distribute", args: readonly unknown[]) {
    const hash = await this.wallet.writeContract({ address, abi: feeRouterAbi, functionName, args } as never);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`FeeRouter.${functionName} reverted: ${hash}`);
    return hash;
  }

  async meetsBondMinimum(agentId: AgentId) {
    if (!this.config.agentRegistry) return true;
    return this.publicClient.readContract({
      address: this.config.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "meetsBondMinimum",
      args: [agentId],
    });
  }

  /**
   * Tells the AgentRegistry which agent leads the Vault (undefined = none) and the Vault's value, which sets that
   * agent's Bond Minimum and blocks its Unbonding. Not part of the ChainPort: whoever applies allocations calls it.
   */
  async reportLead(vaultId: VaultId, agentId: AgentId | undefined, vaultValueUsdc: number) {
    if (!this.config.agentRegistry) return;
    const hash = await this.wallet.writeContract({
      address: this.config.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "reportLead",
      args: [vaultId as Address, agentId ?? "", BigInt(Math.max(0, Math.floor(vaultValueUsdc * 1e6)))],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`AgentRegistry.reportLead reverted: ${hash}`);
  }

  /** Finds the MandateVersionSigned log: binary-search the block by the version's signedAt, then read a narrow range. */
  private async signedJson(vault: Address, version: bigint, signedAt: bigint): Promise<Hex> {
    const latest = await this.publicClient.getBlockNumber();
    let lo = 0n;
    let hi = latest;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      const block = await this.publicClient.getBlock({ blockNumber: mid });
      if (block.timestamp < signedAt) lo = mid + 1n;
      else hi = mid;
    }
    // Several blocks can share a timestamp, so search a small window around the first one.
    const fromBlock = lo > 50n ? lo - 50n : 0n;
    const toBlock = lo + 200n > latest ? latest : lo + 200n;
    const logs = await this.publicClient.getLogs({
      address: this.config.mandateRegistry,
      event: mandateSignedEvent,
      args: { vault, version },
      fromBlock,
      toBlock,
    });
    const log = logs[0];
    if (!log?.args.mandateJson) throw new Error(`MandateVersionSigned for v${version} not found near block ${lo}`);
    return log.args.mandateJson;
  }
}
