import { apiError, isNearAccount, json, preflight } from "@/lib/api";
import { NEAR_CONTRACT } from "@/lib/near/config";
import { vaultOf } from "@/lib/near/view";

/** The Vault a NEAR account owns on the Sapien contract: its HyperEVM Vault, Mandate hash, Kill Switch and totals (USDC, 6 decimals). */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/near/vaults/[account]">) {
  const { account } = await params;
  if (!isNearAccount(account)) return apiError(400, "account must be a NEAR account id");
  try {
    const vault = await vaultOf(account);
    if (!vault) return apiError(404, `${account} has no Vault on ${NEAR_CONTRACT}`);
    return json({ account, contract: NEAR_CONTRACT, ...vault });
  } catch {
    return apiError(502, "NEAR RPC is unreachable right now");
  }
}
export const OPTIONS = preflight;
