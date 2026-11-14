# Agentic Perps Vault

An arena where bonded AI trading agents manage users' perp vaults on Hyperliquid, bound by each user's signed mandate, with losses past the stop-loss covered by agent bonds and a shared fund.

## Vaults and mandates

**Vault**:
A user's isolated pool of trading capital, governed by exactly one Mandate and led by at most one Lead Agent at a time. A user may own several Vaults.
_Avoid_: account, sub-account, portfolio

**Mandate**:
The user-signed policy a Vault trades under: allowed assets, leverage cap, stop-loss %, drawdown cap, blackout windows, veto threshold, kill flag.
_Avoid_: policy, rules, strategy

**Mandate Version**:
One signed revision of a Mandate. Tighter revisions take effect immediately; looser ones only once the Vault is Flat.

**Flat**:
A Vault with no open positions.

**Mandate Check**:
Verifying a proposed trade against the Vault's current Mandate Version, both when it is proposed and again right before it executes.

**Deposit Account**:
The single protocol-owned HyperCore account that receives every cross-chain deposit and forwards it to the right Vault.

**Sapien Contract**:
The NEAR contract (`sapien-vault.testnet`) that a user's NEAR account owns its Vault through. It takes deposits, withdrawal requests, the Mandate hash and the Kill Switch, and it records Decision Commitments and Specialist Agent payouts (ADR-0007).

**Function-Call Key**:
A NEAR access key limited to named methods on one contract. The Execution Engine signs with one, so it can only register Vaults, pay withdrawals, log Decision Commitments and pay agents.

**NEAR Intents**:
NEAR's cross-chain settlement layer. On mainnet, a 1Click deposit address moves NEAR USDC to the Deposit Account on HyperCore. On testnet, Sapien shows the live quote only.

## Agents

**Specialist Agent**:
A strategy agent (momentum, mean-reversion, funding-arb, sentiment) that proposes trades. It must hold a Bond to lead a Vault.
_Avoid_: bot, strategy, trader

**Lead Agent**:
The single Specialist Agent currently trading a given Vault. Every position in a Vault has exactly one Lead Agent responsible for it.

**Allocator**:
The agent that assigns a Lead Agent to each Vault, based on market regime, Bond size and track record. A switch decided at an Epoch boundary takes effect once the Vault is Flat. Until then, the outgoing Lead Agent may only reduce or close positions.
_Avoid_: router, manager

**Builder**:
Whoever registers and bonds a Specialist Agent. A Builder never holds a Vault's trading key.

**Trade Proposal**:
A trade a Specialist Agent proposes, with confidence and rationale. It becomes an order only if it passes the Mandate Check.
_Avoid_: signal, order (before it passes the check)

**Execution Engine**:
The protocol component that Mandate Checks Trade Proposals and signs the orders that pass, using the Vault's Agent Wallet.
_Avoid_: risk engine, executor

**Agent Wallet**:
A Vault's trade-only key, which can place and cancel orders but cannot withdraw. Held only by the Execution Engine.
_Avoid_: API key, hot wallet

**Decision Commitment**:
An onchain hash of a decision, recorded before its order is sent, so the decision can be audited later.
_Avoid_: receipt, proof

## Protection

**Overshoot**:
The loss on a position beyond what an exit exactly at its stop-loss trigger price would have realized: `|fill − trigger| × size`. Fees and funding are excluded.
_Avoid_: slippage, excess loss

**Bond**:
USDC staked by a Builder that is slashed first for all Overshoot on its Lead Agent's positions, including Overshoot from market gaps.
_Avoid_: stake, collateral, deposit

**Bond Minimum**:
5% of the combined value of the Vaults an agent leads. Below it, the agent may only reduce or close positions and the Allocator may not assign it more Vaults.

**Unbonding**:
The 3-day delay before a Builder can withdraw a Bond. It can start only while the agent leads no Vault.

**Infrastructure Failure**:
Overshoot on a position that had no resting stop-loss order on HyperCore when its trigger price was crossed. Any other Overshoot is a market gap.

**Protocol Reserve**:
Protocol-owned funds that cover Overshoot from an Infrastructure Failure, instead of the agent's Bond.
_Avoid_: fee reserve, insurance

**Protection Fund**:
A shared pool, funded by premiums, that covers Overshoot left after the Bond is used up. Pays each Vault at most 10% of its value at the start of the Epoch, per Epoch, and pays pro-rata if short. Always described as "stop-loss protected", never "guaranteed".
_Avoid_: insurance fund, guarantee

**Coverage Ratio**:
Protection Fund balance ÷ total open stop-loss exposure.

**High-Water Mark**:
A Vault's highest value so far. The performance fee and the profit premium apply only to gains above it.
_Avoid_: peak, watermark

## Control

**Epoch**:
The 24h settlement period that scopes Protection Fund caps, premium recalibration, fee settlement and Lead Agent switches.

**Veto Window**:
The 60s pause before a trade above the veto threshold executes, during which the user can cancel it. After it ends, the trade is Mandate Checked again and sent as a market order with a slippage cap, or dropped.

**Regime**:
The market state the Allocator classifies (trend, chop, high-volatility, funding-skew). Each Specialist Agent declares which Regimes it may lead in.

**Automatic Kill**:
A protocol-triggered stop on new positions, used when a Vault hits its drawdown cap or the oracle price strays from a reference price. Existing stop-losses keep running.
_Avoid_: circuit breaker, pause

**Kill Switch**:
A user action that closes all of a Vault's positions, freezes its Lead Agent and unlocks withdrawal.
