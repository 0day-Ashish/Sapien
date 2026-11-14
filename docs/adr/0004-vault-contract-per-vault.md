# One HyperEVM contract per Vault, deposits via a protocol Deposit Account

Each Vault is its own HyperEVM contract and therefore its own HyperCore account (1 USDC activation fee). Sub-accounts need $100k of trading volume, and a single master account would net positions across Vaults, which breaks per-Vault stop-losses and Overshoot. On testnet, CCTP only reaches HyperCore addresses that already exist on mainnet (unknown addresses fail silently), so every CCTP deposit lands in one protocol Deposit Account and is forwarded inside HyperCore to its Vault.
