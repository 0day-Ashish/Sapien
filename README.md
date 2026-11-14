# Sapien: Agentic Perps Vault

Bonded AI trading agents manage users' Hyperliquid Vaults, bound by each user's signed Mandate. Spec: issue #1. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`. Lanes: `docs/team-map.md`.

| Package | What |
| --- | --- |
| `contracts/` | Foundry, HyperEVM: Vault, VaultFactory, MandateRegistry, DecisionLog, MockCctpForwarder. Deployed addresses: `contracts/deployments/`. |
| `engine/` | TypeScript Execution Engine, agents, deposit forwarder, smoke scripts. |
| `frontend/` | Next.js app. |

## Money round trip (testnet)

```
Base Sepolia USDC ──depositForBurnWithHook──▶ MockCctpForwarder ──DepositForBurn event──▶ engine forwarder
   ▲                                                                                        │ usdSend
   │ Circle forwarding mint                                       Deposit Account (HyperCore)┘
   │                                                                     │
 CCTP V2 burn ◀── Vault.bridgeOut ◀── Vault HyperEVM USDC ◀── Vault.withdrawToEvm ◀── Vault (HyperCore perp)
```

- **Deposit (#6).** The user calls `depositForBurnWithHook` with real CCTP V2 arguments: mint recipient and destination caller = Hyperliquid's CctpForwarder, hook data = the Deposit Account, perps. Testnet CCTP only delivers to HyperCore addresses that exist on mainnet, and our Deposit Account is testnet-only, so a **MockCctpForwarder on Base Sepolia** stands in for the cross-chain hop: it checks the same arguments, locks the USDC and emits Circle's exact `DepositForBurn` event. Everything after that is real. The engine matches the depositor to their Vault (`VaultFactory.depositTargetOf`) and sends the USDC from the Deposit Account to the Vault on HyperCore. A Vault's first deposit pays HyperCore's 1 USDC activation fee, and the engine then re-registers the Agent Wallet.
- **Withdraw (#7).** Owner only, and only while the Vault is Flat. `withdrawToEvm` moves USDC from HyperCore to the Vault's HyperEVM address (CoreWriter). `bridgeOut` burns it through CCTP V2 with Circle's forwarding service, which mints it on Base Sepolia. Circle's HyperCore withdrawal action is API-signed, so a contract can't use it.

### Run it

`engine/.env.local` (gitignored) holds `ENGINE_OPERATOR_PRIVATE_KEY` and `DEPOSIT_ACCOUNT_PRIVATE_KEY`.

```bash
cd engine && npm ci
npm run deposits:forward            # engine forwarder: keeps polling Base Sepolia, credits Vaults
npm run smoke:round-trip            # seam 3: deposit 5 USDC -> Vault -> withdraw -> minted on Base Sepolia
npm run smoke:round-trip -- --amount 10
```

The smoke script plays the user with the engine operator key, which needs HYPE on HyperEVM and ETH plus USDC on Base Sepolia ([faucet.circle.com](https://faucet.circle.com)). It prints every tx and ends with the round trip's cost (CCTP fees plus the 1 USDC Vault activation). The Deposit Account needs a USDC float on HyperCore testnet to forward from.

In the app, `/funds` does the same for a connected wallet: deposit with the fee and activation shown up front, then progress through burned, in the Deposit Account and in the Vault. Withdraw shows each step until the mint on Base Sepolia. Run `deposits:forward` while depositing.

### Tests

```bash
cd contracts && forge test     # hook bytes, mock, Vault withdrawal gating
cd engine && npm test          # deposit-landed credits the right Vault
cd frontend && npm test        # hook bytes, fees, withdraw progress
```
