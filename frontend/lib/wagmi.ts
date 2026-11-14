import { createConfig, http, injected } from "wagmi";
import { hyperliquidEvmTestnet } from "viem/chains";

export const hyperEvmTestnet = hyperliquidEvmTestnet;

export const wagmiConfig = createConfig({
  chains: [hyperEvmTestnet],
  connectors: [injected()],
  transports: {
    [hyperEvmTestnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
