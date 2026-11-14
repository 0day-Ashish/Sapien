import { parseAbi, type Address, type Hex } from "viem";

// Overshoot payouts (ticket #15). Contract: contracts/src/settlement/ProtectionFund.sol. Address:
// contracts/deployments/hyperevm-testnet.json; NEXT_PUBLIC_PROTECTION_FUND_ADDRESS overrides it.

export const PROTECTION_FUND = (process.env.NEXT_PUBLIC_PROTECTION_FUND_ADDRESS || "0x6fF69515ca5F4cc60047b1b33aE3937bdAfea598") as Address | null;

export const protectionFundAbi = parseAbi([
  "struct Settlement { address vault; string agentId; uint64 epoch; uint64 settledAt; bool infrastructureFailure; uint256 triggerPriceE8; uint256 fillPriceE8; uint256 sizeE8; uint256 overshoot; uint256 fromReserve; uint256 fromBond; uint256 fromFund; bytes32 evidenceHash; string evidenceRef; }",
  "function claimIds() view returns (bytes32[])",
  "function settlement(bytes32 positionId) view returns (Settlement)",
  "function fundBalance() view returns (uint256)",
  "function reserveBalance() view returns (uint256)",
  "function openExposure() view returns (uint256)",
  "function coverageRatioBps() view returns (uint256)",
]);

export type Settlement = {
  vault: Address;
  agentId: string;
  epoch: bigint;
  settledAt: bigint;
  infrastructureFailure: boolean;
  triggerPriceE8: bigint;
  fillPriceE8: bigint;
  sizeE8: bigint;
  overshoot: bigint;
  fromReserve: bigint;
  fromBond: bigint;
  fromFund: bigint;
  evidenceHash: Hex;
  evidenceRef: string;
};

export type Source = { key: "bond" | "reserve" | "fund" | "unpaid"; label: string; amount: bigint; share: number };

/** Who paid the Overshoot, in waterfall order, with each share of it. Sources that paid nothing are left out. */
export function payoutSources(s: Pick<Settlement, "overshoot" | "fromBond" | "fromReserve" | "fromFund" | "agentId">): Source[] {
  const paid = s.fromBond + s.fromReserve + s.fromFund;
  const rows: Source[] = [
    { key: "reserve", label: "Protocol Reserve", amount: s.fromReserve, share: 0 },
    { key: "bond", label: `${s.agentId}'s Bond`, amount: s.fromBond, share: 0 },
    { key: "fund", label: "Protection Fund", amount: s.fromFund, share: 0 },
    { key: "unpaid", label: "Not covered", amount: s.overshoot > paid ? s.overshoot - paid : BigInt(0), share: 0 },
  ];
  return rows
    .filter((r) => r.amount > BigInt(0))
    .map((r) => ({ ...r, share: s.overshoot > BigInt(0) ? Number((r.amount * BigInt(10_000)) / s.overshoot) / 10_000 : 0 }));
}

/** Coverage Ratio as a percentage, or "no open exposure" when nothing is at risk. */
export function formatCoverage(bps: bigint): string {
  if (bps >= BigInt(2) ** BigInt(255)) return "no open exposure";
  return `${(Number(bps) / 100).toFixed(1)}%`;
}

/** An 8-decimal price or size from a claim, as a plain number string (trailing zeros trimmed). */
export function formatE8(x: bigint): string {
  const whole = x / BigInt(1e8);
  const frac = (x % BigInt(1e8)).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export type Evidence = {
  stop: { cloid: string; asset: string; side: "long" | "short"; triggerPrice: number; placedAt: number; stateOnHyperCore: string };
  fill: { orderId: string; cloid: string | null; price: number; size: number; at: number };
  overshootUsdc: number;
};

/** The evidence JSON kept onchain with the claim, or null if it doesn't parse. */
export function parseEvidence(ref: string): Evidence | null {
  try {
    const e = JSON.parse(ref) as Evidence;
    return e && e.stop && e.fill ? e : null;
  } catch {
    return null;
  }
}
