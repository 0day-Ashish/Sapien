import { parseAbi, type Address } from "viem";

// Builder Bonds (ticket #12): register a Specialist Agent, stake and top up its Bond, start Unbonding, withdraw.
// Contract: contracts/src/agents/AgentRegistry.sol. Address: contracts/deployments/hyperevm-testnet.json.

export const AGENT_REGISTRY = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || null) as Address | null;

export const agentRegistryAbi = parseAbi([
  "struct Agent { address builder; uint8 regimes; uint256 bond; uint64 unbondingEndsAt; uint32 ledVaults; uint256 ledValue; }",
  "function agent(string agentId) view returns (Agent)",
  "function bondMinimum(string agentId) view returns (uint256)",
  "function meetsBondMinimum(string agentId) view returns (bool)",
  "function register(string agentId, uint8 regimes, uint256 bond)",
  "function topUp(string agentId, uint256 amount)",
  "function startUnbonding(string agentId)",
  "function withdrawBond(string agentId) returns (uint256)",
]);

export const REGIMES = [
  { bit: 1, label: "Trend" },
  { bit: 2, label: "Chop" },
  { bit: 4, label: "High volatility" },
  { bit: 8, label: "Funding skew" },
] as const;

export function regimeLabels(bits: number): string[] {
  return REGIMES.filter((r) => (bits & r.bit) !== 0).map((r) => r.label);
}

export type AgentBond = {
  builder: Address;
  regimes: number;
  bond: bigint;
  unbondingEndsAt: bigint;
  ledVaults: number;
  ledValue: bigint;
  bondMinimum: bigint;
  meetsBondMinimum: boolean;
};

export type BondStatus =
  | { kind: "unbonding"; endsAt: Date }
  | { kind: "withdrawable" }
  | { kind: "below-minimum"; shortBy: bigint }
  | { kind: "no-bond" }
  | { kind: "eligible" };

/** Where the Bond stands, as the Builder sees it. `now` is unix seconds. */
export function bondStatus(a: AgentBond, now: bigint): BondStatus {
  if (a.unbondingEndsAt > BigInt(0)) {
    return now >= a.unbondingEndsAt ? { kind: "withdrawable" } : { kind: "unbonding", endsAt: new Date(Number(a.unbondingEndsAt) * 1000) };
  }
  if (a.bond === BigInt(0)) return { kind: "no-bond" };
  if (a.bond < a.bondMinimum) return { kind: "below-minimum", shortBy: a.bondMinimum - a.bond };
  return { kind: "eligible" };
}

/** Unbonding can start only while the agent leads no Vault, holds a Bond and isn't already Unbonding. */
export function canStartUnbonding(a: AgentBond): boolean {
  return a.ledVaults === 0 && a.bond > BigInt(0) && a.unbondingEndsAt === BigInt(0);
}
