import { apiError, json, preflight } from "@/lib/api";
import { hyperClient } from "@/lib/hyperevm";
import { PROTECTION_FUND, payoutSources, protectionFundAbi } from "@/lib/settlement/payouts";

/** Every Overshoot settlement, newest first, with who paid it and the Protection Fund's live Coverage Ratio. USDC amounts have 6 decimals; prices and sizes 8. */
export async function GET() {
  if (!PROTECTION_FUND) return apiError(503, "No ProtectionFund configured");
  const read = { address: PROTECTION_FUND, abi: protectionFundAbi } as const;
  try {
    const [ids, coverageBps, fund, reserve, exposure] = await Promise.all([
      hyperClient.readContract({ ...read, functionName: "claimIds" }),
      hyperClient.readContract({ ...read, functionName: "coverageRatioBps" }),
      hyperClient.readContract({ ...read, functionName: "fundBalance" }),
      hyperClient.readContract({ ...read, functionName: "reserveBalance" }),
      hyperClient.readContract({ ...read, functionName: "openExposure" }),
    ]);
    const items = await Promise.all(
      [...ids].reverse().map(async (id) => {
        const s = await hyperClient.readContract({ ...read, functionName: "settlement", args: [id] });
        return { id, ...s, sources: payoutSources(s) };
      }),
    );
    return json({ protectionFund: PROTECTION_FUND, coverageRatioBps: coverageBps, fundBalance: fund, reserveBalance: reserve, openExposure: exposure, items }, { maxAge: 60 });
  } catch {
    return apiError(502, "HyperEVM RPC is unreachable right now");
  }
}
export const OPTIONS = preflight;
