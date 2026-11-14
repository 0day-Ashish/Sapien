import type { NextRequest } from "next/server";
import { ONE_CLICK, buildQuoteRequest, pickHyperCoreUsdc, quoteAmount, summarizeQuote, type IntentsToken } from "@/lib/near/intents";

// A dry NEAR Intents quote (1Click API, no key, 0.2% fee) for NEAR USDC to HyperCore USDC. Display only.
// GET /api/intents/quote?amount=5  (USDC, decimal) -> { amountIn, amountOut, fee, etaSeconds } in USDC subunits.

const unavailable = (status = 502) => Response.json({ error: "quote unavailable" }, { status });

export async function GET(request: NextRequest) {
  const amount = quoteAmount(request.nextUrl.searchParams.get("amount"));
  if (!amount) return Response.json({ error: "amount must be a USDC amount with at most 6 decimals" }, { status: 400 });
  try {
    const tokensRes = await fetch(`${ONE_CLICK}/tokens`, { signal: AbortSignal.timeout(8000) });
    if (!tokensRes.ok) return unavailable();
    const dest = pickHyperCoreUsdc((await tokensRes.json()) as IntentsToken[]);
    if (!dest) return unavailable();
    const quoteRes = await fetch(`${ONE_CLICK}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildQuoteRequest({ amount, destinationAsset: dest.assetId })),
      signal: AbortSignal.timeout(12000),
    });
    if (!quoteRes.ok) return unavailable();
    const summary = summarizeQuote(await quoteRes.json());
    return summary ? Response.json(summary) : unavailable();
  } catch {
    return unavailable();
  }
}
