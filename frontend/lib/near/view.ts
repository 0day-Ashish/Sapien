import { NEAR_CONTRACT, NEAR_RPC, NEAR_RPC_FALLBACK, NEAR_USDC } from "./config";

// Read-only calls through NEAR's JSON-RPC `call_function`: no wallet needed.

/** The base64 of the JSON args, as `args_base64` wants. */
export function encodeViewArgs(args: object = {}): string {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function viewRequest(contract: string, method: string, args: object = {}) {
  return {
    jsonrpc: "2.0",
    id: "sapien",
    method: "query",
    params: { request_type: "call_function", finality: "optimistic", account_id: contract, method_name: method, args_base64: encodeViewArgs(args) },
  };
}

/** The JSON a view returned: RPC hands back the result as an array of bytes. */
export function decodeViewResult<T>(bytes: number[]): T {
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
}

export async function viewCall<T>(
  contract: string,
  method: string,
  args: object = {},
  fetchFn: typeof fetch = fetch,
  rpc: string = NEAR_RPC,
): Promise<T> {
  // The public RPC rate-limits browsers (the browser reports "Failed to fetch"), so fall back to FastNEAR.
  const body0 = JSON.stringify(viewRequest(contract, method, args));
  const post = (url: string) => fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: body0 });
  let res: Response;
  try {
    res = await post(rpc);
    if (!res.ok && rpc !== NEAR_RPC_FALLBACK) res = await post(NEAR_RPC_FALLBACK);
  } catch (e) {
    if (rpc === NEAR_RPC_FALLBACK) throw e;
    res = await post(NEAR_RPC_FALLBACK);
  }
  if (!res.ok) throw new Error(`NEAR RPC ${res.status}`);
  const body = (await res.json()) as { result?: { result?: number[]; error?: string }; error?: { message?: string; data?: string } };
  if (body.error) throw new Error(body.error.data ?? body.error.message ?? "NEAR RPC error");
  if (body.result?.error) throw new Error(body.result.error);
  return decodeViewResult<T>(body.result?.result ?? []);
}

// ---- typed views on the Sapien contract and test USDC ----

export type VaultRecord = { evm_vault: string; mandate_hash: string | null; killed: boolean; deposited: string; withdrawn: string };
export type WithdrawalStatus = "Requested" | "Paying" | "Paid";
export type Withdrawal = { account: string; requested: string; paid: string; status: WithdrawalStatus };
export type ContractConfig = { owner: string; engine: string; usdc: string; deposits: number; withdrawals: number; decisions: number };

export const vaultOf = (account: string, f?: typeof fetch) => viewCall<VaultRecord | null>(NEAR_CONTRACT, "vault_of", { account }, f);
export const withdrawalOf = (id: number | string, f?: typeof fetch) => viewCall<Withdrawal | null>(NEAR_CONTRACT, "withdrawal", { id: Number(id) }, f);
export const contractConfig = (f?: typeof fetch) => viewCall<ContractConfig>(NEAR_CONTRACT, "config", {}, f);
export const agentAccounts = (f?: typeof fetch) => viewCall<[string, string][]>(NEAR_CONTRACT, "agents", {}, f);
export const usdcBalanceOf = (account: string, f?: typeof fetch) => viewCall<string>(NEAR_USDC, "ft_balance_of", { account_id: account }, f);
