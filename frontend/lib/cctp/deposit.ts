import { concatHex, padHex, stringToHex, toHex, type Address, type Hex } from "viem";

// CCTP V2 deposit from Base Sepolia into HyperCore through Hyperliquid's CctpForwarder (spec #1, ticket #6).
// Source: Circle, "Transfer USDC from Ethereum to HyperCore". A wrong mint recipient, destination caller or hook
// recipient loses funds permanently, so the bytes are pinned by test/cctp-deposit.test.ts (and the same golden
// bytes in contracts/test/MockCctpForwarder.t.sol).

export const CCTP = {
  baseSepoliaDomain: 6,
  hyperEvmDomain: 19,
  baseSepoliaUsdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  /** Real CCTP V2 TokenMessengerV2 on Base Sepolia. Not used while deposits go through the mock. */
  tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  /**
   * What the UI calls `depositForBurnWithHook` on. Testnet CCTP can't reach our testnet-only Deposit Account, so this is
   * our MockCctpForwarder (contracts/deployments/base-sepolia.json). Same args and event as TokenMessengerV2.
   */
  depositMessenger: "0xDE6A33788aA0e0f9EdD93BA169d421f025E7f600",
  /** HyperEVM testnet CctpForwarder: the only valid mint recipient and destination caller. */
  cctpForwarder: "0x02e39ECb8368b41bF68FF99ff351aC9864e5E2a2",
  /** Protocol Deposit Account (#3, ADR-0004): every deposit lands here, then the engine forwards it to the Vault. */
  depositAccount: "0x32c0bce52F64b99ACAe8Bfb6BB91F8ACcce28036",
  /** Testnet cap per recipient, in USDC subunits (6 decimals). */
  maxDeposit: BigInt(1_000_000_000),
  /** HyperCore charges 1 USDC when the first deposit activates a new Vault account. */
  activationFee: BigInt(1_000_000),
  fastFinality: 1000,
  feeApi: "https://iris-api-sandbox.circle.com/v2/burn/USDC/fees",
} as const satisfies Record<string, unknown>;

/** 0 = HyperCore perp balance, 0xFFFFFFFF = spot. Deposits go to perps. */
export const PERP_DEX = 0;

/** bytes24 "cctp-forward" | uint32 version 0 | uint32 dataLength 24 | address recipient | uint32 dex, big-endian. */
export function encodeForwardHookData(recipient: Address, dex: number = PERP_DEX): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error(`Bad HyperCore recipient: ${recipient}`);
  if (!Number.isInteger(dex) || dex < 0 || dex > 0xffffffff) throw new Error(`Bad dex: ${dex}`);
  return concatHex([
    padHex(stringToHex("cctp-forward"), { size: 24, dir: "right" }),
    toHex(0, { size: 4 }),
    toHex(24, { size: 4 }),
    recipient.toLowerCase() as Hex,
    toHex(dex, { size: 4 }),
  ]);
}

/** CCTP's bytes32 form of an EVM address: left-padded with zeros. */
export function addressToBytes32(address: Address): Hex {
  return padHex(address.toLowerCase() as Hex, { size: 32, dir: "left" });
}

export type FeeQuote = { finalityThreshold: number; minimumFee: number; forwardFee: { low: number; med: number; high: number } };

/**
 * maxFee for one transfer, recomputed from Circle's fee API every time: the protocol fee (`minimumFee`, in bps,
 * rounded up) plus the `high` forwarding fee so the transfer isn't delayed for `insufficient_fee`.
 */
export function maxFeeFor(amount: bigint, quotes: FeeQuote[], finality: number = CCTP.fastFinality): bigint {
  const q = quotes.find((x) => x.finalityThreshold === finality);
  if (!q) throw new Error(`No fee quote for finality ${finality}`);
  const bpsE2 = BigInt(Math.round(q.minimumFee * 100)); // bps x100, so 1.3 bps -> 130
  const protocolFee = (amount * bpsE2 + BigInt(999_999)) / BigInt(1_000_000); // ceil(amount * bps / 10_000)
  return protocolFee + BigInt(q.forwardFee.high);
}

/** Circle's fee quotes. Defaults to the deposit route, Base Sepolia -> HyperCore. */
export async function fetchFeeQuotes(
  fetchFn: typeof fetch = fetch,
  route: { from: number; to: number; hyperCoreDeposit: boolean } = {
    from: CCTP.baseSepoliaDomain,
    to: CCTP.hyperEvmDomain,
    hyperCoreDeposit: true,
  },
): Promise<FeeQuote[]> {
  const url = `${CCTP.feeApi}/${route.from}/${route.to}?forward=true${route.hyperCoreDeposit ? "&hyperCoreDeposit=true" : ""}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Circle fee API ${res.status}`);
  return (await res.json()) as FeeQuote[];
}

/** Arguments for `depositForBurnWithHook`, identical for the real TokenMessengerV2 and our MockCctpForwarder. */
export function depositForBurnArgs(amount: bigint, maxFee: bigint) {
  if (amount <= BigInt(0)) throw new Error("Deposit must be positive");
  if (amount > CCTP.maxDeposit) throw new Error("Deposit is over the $1,000 testnet cap");
  if (maxFee >= amount) throw new Error("Deposit doesn't cover the CCTP fee");
  const forwarder = addressToBytes32(CCTP.cctpForwarder);
  return [
    amount,
    CCTP.hyperEvmDomain,
    forwarder, // mintRecipient
    CCTP.baseSepoliaUsdc,
    forwarder, // destinationCaller
    maxFee,
    CCTP.fastFinality,
    encodeForwardHookData(CCTP.depositAccount),
  ] as const;
}

export const depositForBurnWithHookAbi = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
