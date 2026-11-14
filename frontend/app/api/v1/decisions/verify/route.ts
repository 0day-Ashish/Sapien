import type { Hex } from "viem";
import { apiError, engineBase, isBytes32, json, preflight } from "@/lib/api";
import { hyperClient } from "@/lib/hyperevm";
import { DECISION_LOG, decisionLogAbi, verifyDecision, type ReplayItem } from "@/lib/engine/replay";

/**
 * Verifies one Decision Commitment, the same check /replay runs in the browser: fetch the logged decision, re-hash it,
 * and ask the DecisionLog whether that exact hash is onchain. ?hash=0x…
 */
export async function GET(request: Request) {
  const hash = new URL(request.url).searchParams.get("hash") ?? "";
  if (!isBytes32(hash)) return apiError(400, "hash must be a 0x-prefixed 32-byte hex string");
  const isCommitted = (h: Hex) => hyperClient.readContract({ address: DECISION_LOG, abi: decisionLogAbi, functionName: "isCommitted", args: [h] });

  let item: ReplayItem | undefined;
  try {
    const res = await fetch(`${engineBase()}/decisions?hash=${hash}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (res.ok) item = ((await res.json()) as { items: ReplayItem[] }).items[0];
  } catch {
    // The engine being down still leaves the onchain check.
  }
  try {
    if (!item) {
      const [committed, at] = await isCommitted(hash as Hex);
      return json({ hash, decisionLog: DECISION_LOG, decisionFound: false, onchain: committed ? { committed, at: Number(at) } : { committed }, verified: false }, { maxAge: 60 });
    }
    const v = await verifyDecision(item.result.decision, item.result.decisionHash, isCommitted);
    return json({ hash, decisionLog: DECISION_LOG, decisionFound: true, commitmentTx: item.result.commitmentTx, ...v, decision: item.result.decision }, { maxAge: 60 });
  } catch {
    return apiError(502, "HyperEVM RPC is unreachable right now");
  }
}
export const OPTIONS = preflight;
