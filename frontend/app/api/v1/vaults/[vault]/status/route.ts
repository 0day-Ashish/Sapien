import { apiError, fromEngine, isEvmAddress, preflight } from "@/lib/api";

/** A Vault's Lead Agent and any Automatic Kill. */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/vaults/[vault]/status">) {
  const { vault } = await params;
  if (!isEvmAddress(vault)) return apiError(400, "vault must be a 0x address");
  return fromEngine(`/vaults/${vault}/status`, request);
}
export const OPTIONS = preflight;
