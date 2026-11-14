import { ENGINE_URL } from "../engine/veto";

// The engine's NEAR endpoints.

export type NearVault = { account: string; evmVault: string; agentWallet: string };

/** The Vault bound to a NEAR account, null if it has none. */
export async function fetchNearVault(account: string, fetchFn: typeof fetch = fetch): Promise<NearVault | null> {
  const res = await fetchFn(`${ENGINE_URL}/near/vaults/${encodeURIComponent(account)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The engine answered ${res.status}. Is it running at ${ENGINE_URL}?`);
  return (await res.json()) as NearVault;
}

/** Creates (idempotently) and binds the account's Vault on HyperEVM and on the NEAR contract. */
export async function createNearVault(account: string, fetchFn: typeof fetch = fetch): Promise<NearVault> {
  const res = await fetchFn(`${ENGINE_URL}/near/vaults`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account }),
  });
  if (!res.ok) throw new Error(`The engine couldn't create the Vault (${res.status}). Is it running at ${ENGINE_URL}?`);
  return (await res.json()) as NearVault;
}

/** Hands the engine the Mandate whose hash is already committed on NEAR. */
export async function postNearMandate(account: string, mandate: object, fetchFn: typeof fetch = fetch): Promise<{ mandateHash: string; txHash?: string }> {
  const res = await fetchFn(`${ENGINE_URL}/near/mandate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, mandate }),
  });
  if (res.status === 409) throw new Error("The engine's Mandate doesn't match the hash committed on NEAR. Commit it again.");
  if (!res.ok) throw new Error(`The engine didn't accept the Mandate (${res.status}).`);
  return (await res.json()) as { mandateHash: string; txHash?: string };
}
