import { createConfig, http, injected } from "wagmi";
import { baseSepolia, hyperliquidEvmTestnet } from "viem/chains";

export const hyperEvmTestnet = hyperliquidEvmTestnet;

export const wagmiConfig = createConfig({
  // Base Sepolia is where deposits start and withdrawals land (CCTP, tickets #6 and #7).
  chains: [hyperEvmTestnet, baseSepolia],
  connectors: [injected()],
  transports: {
    [hyperEvmTestnet.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
