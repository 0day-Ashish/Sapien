# #4 Testnet spike (throwaway)

Scripts that prove the partly documented primitives behind ADR-0003 and ADR-0004 on Hyperliquid testnet. Findings go into issue #4, not into the engine. The engine's real Exchange port is built in #8.

Each script records what it saw in `state.json` (gitignored), which feeds the ticket comment.

| Step | Script | Proves |
| --- | --- | --- |
| 0 | `npm run setup` | Creates a fresh Agent Wallet key in `.env` and prints the owner's balances. Add `-- --new-owner` to also generate an owner key. |
| 1 | `npm run gas` | Only needed if the owner has no HYPE on HyperEVM. Buys a little HYPE on spot and moves it to HyperEVM. |
| 2 | `npm run deploy` | Deploys `SpikeAccount` on HyperEVM testnet (chain 998). |
| 3 | `npm run activate` | The contract becomes its own HyperCore account: activation fee, then CoreWriter action 7 (spot/perp transfer) and its units. |
| 4 | `npm run agent` | The contract adds the Agent Wallet through CoreWriter action 9, using the shared encoder in `contracts/src/hypercore/`. |
| 5 | `npm run tpsl` | The Agent Wallet trades for the contract: `normalTpsl` vs `positionTpsl` on resting parent, cancel, fill, position growth and close. |
| 6 | `npm run no-withdraw` | The Agent Wallet tries `withdraw3`, `usdSend`, `spotSend`, `agentSendAsset` to itself and `approveAgent`. All should fail. |
| 7 | `npm run cleanup` | Flattens the contract and returns its USDC to the owner through CoreWriter action 13. |

## Setup

1. `npm install` (Node 24 runs the `.ts` files directly) and `brew install foundry`.
2. Put a **testnet-only** owner key in `.env` (see `.env.example`), funded with about 40 testnet USDC on HyperCore. The faucet at https://app.hyperliquid-testnet.xyz/drip may require the address to have used mainnet.
3. Run the steps in order. `npm run typecheck` checks the scripts.

`.env` and `state.json` are gitignored. Never put a mainnet key with real funds here.
