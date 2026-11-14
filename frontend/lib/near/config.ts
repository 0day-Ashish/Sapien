// NEAR testnet addresses. Contract: near/README.md, near/deployments/testnet.json.

export const NEAR_NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "testnet" | "mainnet";
/** The Sapien contract: Vault records, Mandate hash, Kill Switch, withdrawals. */
export const NEAR_CONTRACT = process.env.NEXT_PUBLIC_NEAR_CONTRACT ?? "sapien-vault.testnet";
/** Test USDC (NEP-141, 6 decimals) with an open `faucet`. */
export const NEAR_USDC = process.env.NEXT_PUBLIC_NEAR_USDC ?? "usdc.sapien-vault.testnet";
export const NEAR_RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://rpc.testnet.near.org";
export const NEAR_EXPLORER = "https://testnet.nearblocks.io";
export const HYPEREVM_EXPLORER = "https://testnet.purrsec.com";

export const nearAccountUrl = (account: string) => `${NEAR_EXPLORER}/address/${account}`;
export const nearTxUrl = (hash: string) => `${NEAR_EXPLORER}/txns/${hash}`;
export const hyperEvmAddressUrl = (address: string) => `${HYPEREVM_EXPLORER}/address/${address}`;
