# Agentic Perps Vault — 9.5 Spec

Nov 14, 2026 · @Sachindra

## Pitch

**Deposit USDC from any chain. Get a personal Hyperliquid vault run by competing AI agents that are bound by your mandate, bonded with their own money, and provable down to every decision. Withdraw anywhere.**

It is an open arena where trading agents compete for user capital on Hyperliquid. Every user gets a vault with their own enforced mandate. Agents must stake a bond to trade, and their bond is slashed first when losses run past a stop-loss. A Protection Fund covers what is left. The agents run inside a TEE, trade through keys that cannot withdraw, and commit every decision onchain before the order goes through.

Target score: 9.5/10. The idea reaches 9.5 with agent bonds and the open marketplace; the project reaches 9.5 only with a clean, live demo.

## User flow

A user goes from any-chain USDC to an agent-managed vault and back in seven steps.

1. **Connect and describe a mandate.** The user types it in plain English, for example: "Conservative, BTC and ETH only, never lose more than 8% a month, no trades during US CPI releases."
2. **Confirm the compiled policy.** An LLM drafts structured parameters (max leverage, allowed assets, stop-loss %, monthly drawdown cap, blackout windows, veto threshold). The UI shows them as a readable policy, and the user signs it into the MandateRegistry.
3. **Deposit from any chain.** The user burns USDC with CCTP V2 on their source chain. The burn hook calls CctpForwarder on HyperEVM, which forwards the funds into the user's HyperCore sub-account.
4. **Agents compete for the vault.** The allocator reads the market regime and picks which bonded specialist agent leads this user's vault, within the mandate.
5. **Trades with protection.** Every position opens with a reduce-only stop-loss trigger order placed on HyperCore. Trades above the veto threshold wait 60 seconds for the user to veto.
6. **Watch in real time.** The agent's-eye view shows what the agent sees, its confidence, the mandate check, and live PnL. The replay view scrubs through past decisions.
7. **Withdraw anywhere.** Kill switch or normal exit: positions close, USDC moves HyperCore → HyperEVM → CCTP burn → mint on the user's chosen chain.

## Core components

Five pieces make up the base product; the add-ons in the next section sit on top of them.

| Component | What it does | Key guardrail |
| --- | --- | --- |
| Per-user vault | A HyperCore sub-account per user (or per-user virtual accounting on one master if testnet sub-account limits are low) | Funds only move by user signature or the withdrawal path |
| MandateRegistry | Onchain policy per vault: leverage cap, assets, SL %, drawdown cap, blackout windows, veto threshold, kill flag | Agents' orders are checked against it before signing |
| Allocator agent | Detects regime (trend, chop, high volatility, funding skew) and weights capital across specialists per vault | Weights by bond × risk-adjusted track record; never overrides the mandate |
| Specialist agents | Momentum, mean-reversion, funding-arb, news/sentiment; each proposes trades with confidence and rationale | Must be bonded; only trade assets the mandate allows |
| Execution and risk engine | Signs orders with a Hyperliquid API (agent) wallet and places SL as reduce-only trigger orders on HyperCore | The agent wallet can trade but cannot withdraw |

**Kill switch and veto, at three levels**

| Level | Trigger | Effect |
| --- | --- | --- |
| User | One click in the UI | Closes all positions, freezes agents, unlocks withdrawal |
| Automatic | Drawdown cap hit, volatility spike, oracle deviation | Stops new positions; existing SL orders keep running |
| Veto window | Trade above the size threshold | Shows the proposed trade; executes after 60s unless vetoed |

## The 9.5 add-ons

Seven add-ons take the idea from 8.5 to 9.5; agent bonds and the open marketplace do most of the work.

| Add-on | Adds | Effort |
| --- | --- | --- |
| Agent bonds as first-loss capital | +0.4 | Low |
| Open agent marketplace | +0.3 | Medium |
| TEE-attested agents | +0.2 | Medium–high |
| Live track record + replay | +0.2 | Low, start early |
| Natural-language mandates | +0.1 | Low |
| Mandate Protection Fund (mandatory) | in base 8.5 | Medium |
| Agent's-eye view | in base 8.5 | Low |

### 1. Agent bonds as first-loss capital

Every strategy agent stakes a bond in USDC before it can manage capital. When a fill lands past the stop-loss, the overshoot comes out of the responsible agent's bond first. The allocator gives more capital to agents with larger bonds and better records. Pitch line: "Every agent trading your money has its own money on the line."

- Solves bootstrapping: bonds absorb most overshoot, so the fund is rarely touched.
- Solves agent-caused losses: a bad agent pays for its own mistakes automatically.
- Minimum bond scales with the capital an agent can manage (for example, bond ≥ 5% of allocated capital).

### 2. Mandate Protection Fund (mandatory)

Every vault pays in; the fund covers overshoot past the stop-loss after the agent's bond is used up. It covers only overshoot (gaps, slippage, wicks, cascades), capped per user per epoch, and pays pro-rata if short. Call it **"stop-loss protected"**, never "guaranteed", and show the coverage ratio live.

### 3. Open agent marketplace

Outside builders register strategy agents: post a bond, pass a sandbox paper-trading period, then become eligible for allocation. They earn a performance fee when the allocator picks them. This turns the product into a platform with network effects, and mirrors the hire-an-agent, revenue-share model.

### 4. TEE-attested agents

The allocator and the first-party agents run inside a TEE (Phala, Marlin or AWS Nitro). The Hyperliquid agent-wallet key is generated and sealed inside the enclave. Each decision is signed by the enclave and its hash committed onchain before the order is sent, which proves that the audited code, and nothing else, traded the money.

### 5. Natural-language mandates

The user writes a mandate in plain words; an LLM drafts structured parameters; the UI shows them back; the user signs. The LLM only drafts. The contract enforces exactly what was signed.

### 6. Live track record and replay

Agents start trading on testnet days before judging. The dashboard shows a leaderboard with real fills, at least one real overshoot paid by a bond or the fund, and a replay that scrubs any trade: what the agent saw, its reasoning, the order, the outcome.

### 7. Agent's-eye view

A live feed per vault, for example: "Momentum agent sees BTC breaking the 4h range, funding neutral, confidence 72%, proposing 2x long · mandate check ✓ · veto window 60s." This is the screen judges remember.

## Architecture

Every order passes the mandate check and is signed by a trade-only key; money only leaves a vault through the user's own withdrawal path.

&#91;embedded content: system architecture · deposit path, TEE agents, HyperEVM contracts\]

Withdrawals run the deposit path in reverse: HyperCore → HyperEVM → CCTP burn → mint on the chosen chain.

| Contract (HyperEVM) | Holds | Called by |
| --- | --- | --- |
| MandateRegistry | Each vault's signed policy and kill flag | User (write), mandate check (read) |
| AgentRegistry + Bonds | Agent identity, bond balance, sandbox status | Builders (stake), risk engine (slash) |
| ProtectionFund | Premiums, seed, coverage ratio, payouts | Fee router (in), risk engine (claims) |
| DecisionLog | Hash of each decision, signed by the enclave | Agents, before every order |
| FeeRouter | Splits premiums and performance fees | Settlement job each epoch |

## Economics and loss waterfall

Losses up to the stop-loss are the user's own risk; only overshoot past the stop-loss is covered, in this order.

1. **Responsible agent's bond** is slashed for the overshoot it caused.
2. **Protocol fee reserve** covers overshoot caused by an agent or infrastructure bug (for example, an SL that was never placed), so the fund is not drained by operator mistakes.
3. **Mandate Protection Fund** covers the rest, capped per user per epoch.
4. **Pro-rata payout** if the fund is short. Nobody is clawed back.

**Money in**

| Flow | Paid by | Goes to |
| --- | --- | --- |
| Base premium: a small per-trade fee scaled by mandate risk tier | Every vault, winning or losing | Protection Fund |
| Profit premium: 2–5% of realized profit, risk-tiered | Profitable vaults | Protection Fund |
| Performance fee on realized profit | Profitable vaults | Agent that generated it, plus a protocol cut |
| Protocol fee share (20–30%) | Protocol | Protection Fund top-up |
| Seed allocation | Protocol treasury | Protection Fund at launch |

**Premium pricing.** Start with a transparent formula and recalibrate each epoch from realized overshoot:

```latex
\text{premium rate} = k \cdot \text{leverage} \cdot \sigma_{\text{asset}} \cdot \frac{1}{\text{SL distance}}
```

Higher leverage, more volatile assets and tighter stops pay more. The dashboard shows each vault's tier and the fund's coverage ratio (fund size ÷ total open SL exposure).

## Demo script

The demo runs about four minutes; the protection payout in step 6 is the moment that earns the score.

1. **Hook (20s).** "AI trading vaults ask you to trust a black box. Ours puts the agent's own money first in line." Show the live leaderboard with several days of real testnet fills.
2. **Mandate (30s).** Type a mandate in plain English; show the compiled policy; sign it.
3. **Deposit (30s).** Deposit USDC from Base Sepolia through CCTP; the vault appears on HyperCore.
4. **Agents compete (40s).** The allocator picks the momentum agent; the agent's-eye view shows its reasoning, confidence and mandate check. The decision hash lands onchain before the order.
5. **Guardrail (20s).** The agent proposes a trade over the leverage cap; the mandate check rejects it and the agent re-plans inside the limits. A large trade opens a veto window.
6. **Protection (40s).** A scripted price move gaps through the stop-loss; the fill lands past the trigger. The overshoot is slashed from the agent's bond and the user is refunded. If a real overshoot happened during the track-record period, replay that one instead.
7. **Marketplace (20s).** Register an external agent live: bond posted, sandbox period starts.
8. **Exit (30s).** Hit the kill switch; positions close; withdraw to Arbitrum Sepolia through CCTP.
9. **Trust slide (10s).** The agent key is sealed in a TEE, cannot withdraw, and every decision is committed onchain.

## Build plan and risks

Build in three tiers and only start the next once the previous one runs end to end; a working must-ship tier beats a half-working everything.

**Must ship**

- [ ] CCTP deposit from one chain into a HyperCore sub-account, and withdrawal back out (test the full round trip on day 1)
- [ ] MandateRegistry contract with leverage, asset, SL, drawdown and kill-flag fields
- [ ] Agent wallet execution with SL placed as reduce-only trigger orders
- [ ] Two or three specialist agents plus the allocator
- [ ] Agent bond contract with slashing for overshoot
- [ ] Protection Fund contract, seeded, with coverage ratio
- [ ] Kill switch and veto window
- [ ] Dashboard: vault PnL, agent's-eye view, leaderboard

**Should ship**

- [ ] Natural-language mandate compiler
- [ ] Decision hashes committed onchain before each order
- [ ] Replay view
- [ ] Agents trading live on testnet several days before judging

**Stretch**

- [ ] TEE deployment with sealed agent key and attestation shown in the UI
- [ ] External agent registration with sandbox period
- [ ] Second and third deposit chains

**Risks**

| Risk | Fallback |
| --- | --- |
| Testnet sub-account limit too low | One master account with per-user virtual accounting; say so in the demo |
| Testnet HyperCore → HyperEVM transfer cap makes withdrawals fail silently | Script and test the round trip early; keep net withdrawals below net deposits |
| CCTP testnet recipient-address limitations | Check Circle's HyperCore notes before wiring the forwarder |
| No real overshoot occurs before the demo | Scripted price move on a thin testnet market |
| TEE setup eats the timeline | Ship without it; show the design on the trust slide |
