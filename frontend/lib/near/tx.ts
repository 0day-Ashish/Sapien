import { NEAR_CONTRACT, NEAR_USDC } from "./config";

// Transactions the user signs in Meteor, in near-connect's `signAndSendTransaction` shape.

const TGAS = (n: number) => `${n}000000000000`;
/** 0.00125 NEAR: the storage a USDC holder needs before it can receive. */
export const STORAGE_DEPOSIT_YOCTO = "1250000000000000000000";

export type TxRequest = {
  receiverId: string;
  actions: { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } }[];
};

const call = (receiverId: string, methodName: string, args: object, gas: number, deposit = "0"): TxRequest => ({
  receiverId,
  actions: [{ type: "FunctionCall", params: { methodName, args, gas: TGAS(gas), deposit } }],
});

/** Test USDC from the open faucet (at most 1,000 per call); it registers the caller's storage itself. */
export const faucetTx = (subunits: string) => call(NEAR_USDC, "faucet", { amount: subunits }, 30);

/** Deposit: `ft_transfer_call` into the contract. The sender must already have a Vault, or the token refunds. */
export const depositTx = (subunits: string) =>
  call(NEAR_USDC, "ft_transfer_call", { receiver_id: NEAR_CONTRACT, amount: subunits, msg: "" }, 100, "1");

export const requestWithdrawTx = (subunits: string) => call(NEAR_CONTRACT, "request_withdraw", { amount: subunits }, 30);

/** `mandateHash`: 64 hex characters, no 0x. */
export const commitMandateTx = (mandateHash: string) => call(NEAR_CONTRACT, "commit_mandate", { mandate_hash: mandateHash }, 30);

export const setKilledTx = (killed: boolean) => call(NEAR_CONTRACT, "set_killed", { killed }, 30);

export const storageDepositTx = (account: string) => call(NEAR_USDC, "storage_deposit", { account_id: account }, 30, STORAGE_DEPOSIT_YOCTO);

type Outcome = {
  status?: { SuccessValue?: string } | string;
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
};

/** The transaction's hash from whatever the wallet returned. */
export function txHash(outcome: unknown): string | undefined {
  const o = outcome as Outcome | undefined;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id;
}

/** The id `request_withdraw` returned (the call's JSON success value), or null if the outcome doesn't carry one. */
export function withdrawalIdFrom(outcome: unknown): number | null {
  const status = (outcome as Outcome | undefined)?.status;
  const value = typeof status === "object" ? status?.SuccessValue : undefined;
  if (!value) return null;
  try {
    const id = JSON.parse(atob(value));
    return Number.isInteger(id) && id >= 0 ? id : null;
  } catch {
    return null;
  }
}
