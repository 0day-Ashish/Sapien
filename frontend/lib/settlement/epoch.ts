import { parseAbi, type Address } from "viem";

// Epoch settlement (ticket #17). Contract: contracts/src/settlement/FeeRouter.sol. Address:
// contracts/deployments/hyperevm-testnet.json; NEXT_PUBLIC_FEE_ROUTER_ADDRESS overrides it.

export const FEE_ROUTER = (process.env.NEXT_PUBLIC_FEE_ROUTER_ADDRESS || "0x7Ed923A8ed0c614cC93EBb2b79E53fd6ebCfCA1e") as Address;

export const feeRouterAbi = parseAbi([
  "struct EpochReport { uint64 epoch; uint64 settledAt; uint256 value; uint256 highWaterMark; uint256 profit; uint256 builderFee; uint256 protocolFee; uint256 profitPremium; uint256 basePremium; uint256 notional; uint32 premiumRatePpm; string agentId; address builder; }",
  "function latest(address vault) view returns (EpochReport)",
  "function highWaterMark(address vault) view returns (uint256)",
  "function owed(address vault) view returns (uint256)",
]);

export type EpochReport = {
  epoch: bigint;
  settledAt: bigint;
  value: bigint;
  highWaterMark: bigint;
  profit: bigint;
  builderFee: bigint;
  protocolFee: bigint;
  profitPremium: bigint;
  basePremium: bigint;
  notional: bigint;
  premiumRatePpm: number;
  agentId: string;
  builder: Address;
};

export type RiskTier = { key: "low" | "medium" | "high"; label: string; chip: string };

/** Same cut-offs as FeeRouter.tierOf: Low below 3 bps, Medium below 8 bps, High from 8 bps. */
export function riskTier(premiumRatePpm: number): RiskTier {
  if (premiumRatePpm < 300) return { key: "low", label: "Low risk", chip: "chip-forest" };
  if (premiumRatePpm < 800) return { key: "medium", label: "Medium risk", chip: "chip-amber" };
  return { key: "high", label: "High risk", chip: "chip-clay" };
}

/** A premium rate in parts per million of notional, as basis points ("4.5 bps"). */
export function formatRate(ppm: number): string {
  const bps = ppm / 100;
  return `${Number.isInteger(bps) ? bps : bps.toFixed(2).replace(/0$/, "")} bps`;
}

/** Fees the Vault paid on its profit this Epoch: performance fee, protocol fee and profit premium. */
export const profitFees = (r: Pick<EpochReport, "builderFee" | "protocolFee" | "profitPremium">) => r.builderFee + r.protocolFee + r.profitPremium;
