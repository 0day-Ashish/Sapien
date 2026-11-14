import { apiError, json, preflight } from "@/lib/api";
import { NEAR_CONTRACT, NEAR_NETWORK, NEAR_USDC } from "@/lib/near/config";
import { agentAccounts, contractConfig } from "@/lib/near/view";

/** The Sapien contract's config (owner, engine key account, USDC, counters) and each Specialist Agent's payout account. */
export async function GET() {
  try {
    const [config, agents] = await Promise.all([contractConfig(), agentAccounts()]);
    return json({ network: NEAR_NETWORK, contract: NEAR_CONTRACT, usdc: NEAR_USDC, config, agents: agents.map(([agentId, account]) => ({ agentId, account })) }, { maxAge: 60 });
  } catch {
    return apiError(502, "NEAR RPC is unreachable right now");
  }
}
export const OPTIONS = preflight;
