import { parseUsdc } from "../vault/funds";

// NEAR Intents quote (1Click API): what the same USDC would do on the mainnet route, NEAR to HyperCore. Display only.
// Testnet deposits settle through the Sapien NEAR contract, not through this route.

export const ONE_CLICK = "https://1click.chaindefuser.com/v0";
export const NEAR_USDC_ASSET = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
/** The protocol Deposit Account on HyperCore that receives routed USDC. */
export const DEPOSIT_ACCOUNT = "0x32c0bce52F64b99ACAe8Bfb6BB91F8ACcce28036";
/** A valid, existing mainnet NEAR account for a dry quote's refund address (the API rejects unknown accounts). */
export const REFUND_PLACEHOLDER = "alice.near";

export type IntentsToken = { assetId: string; symbol: string; blockchain: string; decimals: number };

/** HyperCore USDC with 6 decimals (the perp collateral), else any HyperCore USDC. */
export function pickHyperCoreUsdc(tokens: IntentsToken[]): IntentsToken | null {
  const usdc = tokens.filter((t) => t.symbol === "USDC" && t.blockchain === "hypercore");
  return usdc.find((t) => t.decimals === 6) ?? usdc[0] ?? null;
}

export function buildQuoteRequest(input: { amount: string; destinationAsset: string; now?: Date }) {
  const now = input.now ?? new Date();
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: NEAR_USDC_ASSET,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: input.destinationAsset,
    amount: input.amount,
    refundTo: REFUND_PLACEHOLDER,
    refundType: "ORIGIN_CHAIN",
    recipient: DEPOSIT_ACCOUNT,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(now.getTime() + 3_600_000).toISOString(),
  };
}

export type QuoteSummary = {
  /** USDC subunits (6 decimals), as strings. */
  amountIn: string;
  amountOut: string;
  fee: string;
  etaSeconds: number;
};

export function summarizeQuote(body: unknown): QuoteSummary | null {
  const q = (body as { quote?: Record<string, unknown> } | null)?.quote;
  if (!q || typeof q.amountIn !== "string" || typeof q.amountOut !== "string") return null;
  const inn = BigInt(q.amountIn);
  const out = BigInt(q.amountOut);
  return {
    amountIn: inn.toString(),
    amountOut: out.toString(),
    fee: (inn > out ? inn - out : BigInt(0)).toString(),
    etaSeconds: typeof q.timeEstimate === "number" ? q.timeEstimate : 0,
  };
}

/** The `amount` query value (USDC, decimal) as subunits, or null. */
export const quoteAmount = (input: string | null): string | null => {
  const v = input ? parseUsdc(input) : null;
  return v === null ? null : v.toString();
};
