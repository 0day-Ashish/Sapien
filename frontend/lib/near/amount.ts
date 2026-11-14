import { formatUsdc, parseUsdc } from "../vault/funds";

export { formatUsdc, parseUsdc };

/** A typed USDC amount as the decimal string of subunits NEAR methods take (6 decimals), or null if invalid. */
export function toSubunits(input: string): string | null {
  const v = parseUsdc(input);
  return v === null ? null : v.toString();
}

/** USDC subunits from a contract U128 string (or null/undefined as zero). */
export function fromU128(value: string | null | undefined): bigint {
  return value && /^\d+$/.test(value) ? BigInt(value) : BigInt(0);
}
