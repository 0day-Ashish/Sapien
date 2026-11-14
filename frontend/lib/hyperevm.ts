import { createPublicClient, http } from "viem";
import { hyperliquidEvmTestnet } from "viem/chains";

// HyperEVM testnet: where each Vault, the FeeRouter, the Protection Fund and the registries live. Reads only; the user's
// wallet is a NEAR wallet, so the browser never signs on HyperEVM.

export const hyperEvmTestnet = hyperliquidEvmTestnet;
export const hyperClient = createPublicClient({ chain: hyperEvmTestnet, transport: http() });
