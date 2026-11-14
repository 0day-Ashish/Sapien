# NEAR replaces Base Sepolia, Solana and CCTP as the user side

Users now hold a NEAR account (Meteor Wallet) instead of an EVM or Solana wallet. Deposits, withdrawal requests, the Mandate hash, the Kill Switch, Decision Commitments and Specialist Agent payouts all go through one NEAR contract, `sapien` (`near/sapien`). Trading is unchanged: Vaults stay HyperEVM contracts trading on HyperCore (ADR-0004). The contract emits an event for each action, and the Execution Engine forwards deposits from the Deposit Account and pays withdrawals.

Everything runs on testnet. NEAR Intents has no testnet, so on mainnet the deposit leg is a 1Click deposit address (NEAR USDC → HyperCore USDC, recipient the Deposit Account). On testnet the UI shows a live `dry: true` 1Click quote for that route, and the money moves as test USDC through the `sapien` contract. HyperCore testnet USDC can't be bridged from NEAR, so the Deposit Account credits Vaults from its float, and the contract pays withdrawals from its own USDC pool. This is the same mirror the CCTP mock forwarder used before.

The engine signs on NEAR with a function-call key that can only call `register_vault`, `pay_withdraw`, `log_decision` and `pay_agent`. It can't move the contract's USDC any other way, and it can't touch a user's Mandate or Kill Switch. On HyperEVM, the engine operator owns each Vault on the user's behalf (testnet custody). It publishes a Mandate only when its sha256 matches the hash the user committed from their own NEAR account.

## Considered
- **Full mainnet with NEAR Intents:** this would need a HyperEVM mainnet redeploy and real funds on deadline day. Rejected for the hackathon; the 1Click quote path is already in place.
- **Chain Signatures** (the Vault owner is an EVM address derived from the user's NEAR account through the MPC signer): this removes engine custody of withdrawals. It is the next step, and it is not built yet.
