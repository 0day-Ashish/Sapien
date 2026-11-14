import { keccak256, toHex, type Hex } from "viem";
import { apiError, isBytes32, json, preflight } from "@/lib/api";
import { hyperClient } from "@/lib/hyperevm";
import { PROTECTION_FUND, parseEvidence, payoutSources, protectionFundAbi } from "@/lib/settlement/payouts";

/** One Overshoot settlement by position id (the stop-loss cloid as bytes32), with its parsed evidence and whether it matches the evidence hash onchain. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/payouts/[id]">) {
  const { id } = await params;
  if (!PROTECTION_FUND) return apiError(503, "No ProtectionFund configured");
  if (!isBytes32(id)) return apiError(400, "id must be a 0x-prefixed 32-byte hex string");
  try {
    const s = await hyperClient.readContract({ address: PROTECTION_FUND, abi: protectionFundAbi, functionName: "settlement", args: [id as Hex] });
    if (s.settledAt === BigInt(0)) return apiError(404, "No settlement for that id");
    return json({ id, ...s, sources: payoutSources(s), evidence: parseEvidence(s.evidenceRef), evidenceMatches: keccak256(toHex(s.evidenceRef)) === s.evidenceHash }, { maxAge: 300 });
  } catch {
    return apiError(502, "HyperEVM RPC is unreachable right now");
  }
}
export const OPTIONS = preflight;
