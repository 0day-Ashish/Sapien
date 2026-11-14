import { parseAbi, parseUnits, type Address } from "viem";

// Reads and amounts for moving USDC into and out of a Vault (tickets #6, #7).
// Addresses: contracts/deployments/hyperevm-testnet.json.

export const VAULT_FACTORY = (process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS ??
  "0x820565B32244bBb7F1c6146f667C5c7dedda2fEE") as Address;
/** USDC on HyperEVM: where `withdrawToEvm` lands before `bridgeOut`. */
export const HYPEREVM_USDC: Address = "0x2B3370eE501B4a559b57D449569354196457D8Ab";
export const HYPERCORE_INFO_API = "https://api.hyperliquid-testnet.xyz/info";

export const factoryAbi = parseAbi(["function depositTargetOf(address owner) view returns (address)"]);
export const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function isFlat() view returns (bool)",
  "function withdrawToEvm(uint64 amount)",
  "function bridgeOut(uint256 amount, uint32 destinationDomain, bytes32 recipient, uint256 maxFee)",
]);

/** A typed USDC amount in subunits (6 decimals), or null if it isn't a positive amount with at most 6 decimals. */
export function parseUsdc(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const v = parseUnits(s, 6);
  return v > BigInt(0) ? v : null;
}

/** HyperCore's decimal USDC string, truncated to 6-decimal subunits. */
export function usdcFromHyperCore(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  return BigInt(whole || "0") * BigInt(1_000_000) + BigInt((frac + "000000").slice(0, 6));
}

export function formatUsdc(subunits: bigint): string {
  const whole = subunits / BigInt(1_000_000);
  const frac = (subunits % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""} USDC`;
}

export type HyperCoreAccount = { exists: boolean; perpWithdrawable: bigint };

/** A Vault's HyperCore account: whether it's activated, and its withdrawable perp balance. */
export async function hyperCoreAccount(user: Address, fetchFn: typeof fetch = fetch): Promise<HyperCoreAccount> {
  const post = async (body: object) => {
    const res = await fetchFn(HYPERCORE_INFO_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HyperCore info API ${res.status}`);
    return res.json();
  };
  const [role, state] = await Promise.all([post({ type: "userRole", user }), post({ type: "clearinghouseState", user })]);
  return { exists: role.role !== "missing", perpWithdrawable: usdcFromHyperCore(String(state.withdrawable ?? "0")) };
}
