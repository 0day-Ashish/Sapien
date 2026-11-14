import { type Address } from "viem";
import { CCTP, addressToBytes32, fetchFeeQuotes, maxFeeFor, type FeeQuote } from "./deposit";

// Withdrawal from a Flat Vault to Base Sepolia (ticket #7). Two Vault calls, because HyperCore credits HyperEVM a
// block later: `withdrawToEvm(amount)` (HyperCore perp -> the Vault's HyperEVM address), then
// `bridgeOut(amount, 6, recipient, maxFee)` (CCTP V2 burn with Circle's forwarding, minted on Base Sepolia).

export const STANDARD_FINALITY = 2000;
export const irisMessagesApi = "https://iris-api-sandbox.circle.com/v2/messages";

export function fetchWithdrawFeeQuotes(fetchFn: typeof fetch = fetch): Promise<FeeQuote[]> {
  return fetchFeeQuotes(fetchFn, { from: CCTP.hyperEvmDomain, to: CCTP.baseSepoliaDomain, hyperCoreDeposit: false });
}

/** `bridgeOut` arguments. The recipient receives `amount - fee`, with fee <= maxFee. */
export function bridgeOutArgs(amount: bigint, recipient: Address, quotes: FeeQuote[]) {
  const maxFee = maxFeeFor(amount, quotes, STANDARD_FINALITY);
  if (maxFee >= amount) throw new Error("Withdrawal doesn't cover the CCTP forwarding fee");
  return [amount, CCTP.baseSepoliaDomain, addressToBytes32(recipient), maxFee] as const;
}

export type WithdrawStage = "burned" | "attested" | "minted" | "delayed";

type IrisMessage = {
  status?: string;
  forwardState?: string;
  destinationMintTxHash?: string | null;
  forwardTxHash?: string | null;
  delayReason?: string | null;
};

/** Where a burn stands, from Circle's messages API. `null` until Circle has seen the burn. */
export function withdrawStage(messages: IrisMessage[] | undefined): { stage: WithdrawStage; mintTx?: string; reason?: string } | null {
  const m = messages?.[0];
  if (!m) return null;
  const mintTx = m.destinationMintTxHash ?? m.forwardTxHash;
  if (mintTx) return { stage: "minted", mintTx };
  if (m.delayReason) return { stage: "delayed", reason: m.delayReason };
  if (m.status === "complete") return { stage: "attested" };
  return { stage: "burned" };
}

export async function fetchWithdrawStage(burnTx: `0x${string}`, fetchFn: typeof fetch = fetch) {
  const res = await fetchFn(`${irisMessagesApi}/${CCTP.hyperEvmDomain}?transactionHash=${burnTx}`);
  if (res.status === 404) return null; // not indexed yet
  if (!res.ok) throw new Error(`Circle messages API ${res.status}`);
  return withdrawStage(((await res.json()) as { messages?: IrisMessage[] }).messages);
}
