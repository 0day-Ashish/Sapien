# NEAR contracts (testnet)

- `sapien/`: the user side of a Vault on NEAR. Holds the deposits, the Mandate hash, the Kill Switch, Decision Commitments, and the Specialist Agents' payout accounts.
- `test-usdc/`: NEP-141 test USDC (6 decimals) with an open `faucet`. Testnet only.

```bash
cargo test                                               # 15 unit tests
(cd sapien && cargo near build non-reproducible-wasm)    # target/near/sapien/sapien.wasm
(cd test-usdc && cargo near build non-reproducible-wasm)
```

Rust 1.95 is pinned in `rust-toolchain.toml`.

## Interface (lanes B and C build against this)

| Method | Caller | Does |
|---|---|---|
| `new(owner, engine, usdc)` | init | |
| `register_vault(account, evm_vault)` | engine | binds a NEAR account to its HyperEVM Vault, once only |
| `ft_transfer_call` on usdc → `ft_on_transfer` | user | deposits into the sender's Vault; full refund if the token is wrong or the sender has no Vault |
| `request_withdraw(amount) -> id` | user | asks for USDC back |
| `pay_withdraw(id, amount)` | engine | pays `amount` (what left the Vault); a failed transfer reverts to Requested |
| `commit_mandate(mandate_hash)` | user | 32-byte hex hash of the signed Mandate |
| `set_killed(bool)` | user | Kill Switch |
| `log_decision(account, agent_id, hash) -> id` | engine | Decision Commitment |
| `register_agent(agent_id, account)` | owner | a Specialist Agent's payout account |
| `pay_agent(agent_id, amount, memo?)` | engine | pays an agent's fee share |
| views: `vault_of(account)`, `withdrawal(id)`, `decision(id)`, `agents()`, `config()` | anyone | |

Amounts are USDC subunits as strings (`U128`). The engine signs with a function-call key limited to this contract.

Events are NEP-297 logs: `EVENT_JSON:{"standard":"sapien","version":"1.0.0","event":<name>,"data":[{...}]}`.

| Event | Data |
|---|---|
| `vault_registered` | `account, evm_vault` |
| `deposit` | `id, account, evm_vault, amount` |
| `withdrawal_requested` | `id, account, amount` |
| `withdrawal_paid` / `withdrawal_failed` | `id, account, amount?` |
| `mandate_committed` | `account, mandate_hash` |
| `kill_switch` | `account, killed` |
| `decision` | `id, account, agent_id, hash` |
| `agent_registered` / `agent_paid` | `agent_id, account, amount?, memo?` |

## Deployed (testnet)

`sapien-vault.testnet` (contract), `usdc.sapien-vault.testnet` (test USDC), `engine.sapien-vault.testnet` (engine; signs with a function-call key limited to `register_vault`, `pay_withdraw`, `log_decision`, `pay_agent`). Tx IDs in `deployments/testnet.json`; view on https://testnet.nearblocks.io.

The smoke round-trip on `smoke.sapien-vault.testnet` went: faucet 5, Vault registered, deposit 2, Mandate committed, Decision logged, withdraw 1 requested and paid. It ended with `deposited 2 / withdrawn 1` and a wallet balance of 4.
