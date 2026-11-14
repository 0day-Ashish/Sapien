# Team map

Who picks which ticket. Spec: #1. Tickets: #2–#23 (sub-issues of #1, with native "blocked by" links).
Put names next to A/B/C. Pick the next ticket in your queue whose blockers are closed.

## Lanes

| Lane | Owns | Owns the interface |
| --- | --- | --- |
| **A: Chain & money** (Solidity, CCTP) | Vault and Mandate contracts, deposits and withdrawals, settlement waterfall, fees, Solana | Contract ABIs and events, consumed by the engine chain port and the UI |
| **B: Engine & agents** (TypeScript) | Execution Engine pipeline, Hyperliquid exchange port, agents, Allocator, demo scripts, deployment | `handle(event)`, the event types and both port interfaces |
| **C: Product & frontend** (Next.js) | Scaffold, every UI flow, Builder and user features, LLM features | UI data contracts (what the dashboard reads from the engine and chain) |

Tickets are vertical slices, so the owner drives the slice end to end and pulls in the lane that owns a layer for review.

## Queues (in order)

**A: Chain & money**
1. #3 Fund Deposit Account on HyperCore mainnet *(human, do day 1; no blockers)*
2. #5 Create a Vault and sign a Mandate *(needs #2, #4)*
3. #6 Deposit from Base Sepolia
4. #7 Withdraw a Flat Vault, plus smoke script
5. #15 Overshoot settlement *(needs #8 from B, #12 from C)*
6. #17 Epoch settlement *(needs #13 from B)*
7. #22 Solana devnet deposit and withdraw

**B: Engine & agents**
1. #4 Testnet spike: contract accounts, Agent Wallet, grouped TP/SL *(needs #2)*
2. #8 First guarded trade *(needs #5)*
3. #11 Full Mandate rules and Automatic Kill
4. #13 Momentum agent and Allocator *(needs #12 from C)*
5. #14 Funding-arb agent
6. #16 Demo Overshoot script *(needs #15)*
7. #21 Mean-reversion agent
8. #23 Engine runs continuously on testnet

**C: Product & frontend**
1. #2 Monorepo scaffold and test seams *(no blockers; unblocks everyone, so do this first)*
2. #19 Natural-language Mandate compiler *(needs #5; prompt and schema work can start early)*
3. #10 Veto Window *(needs #8)*
4. #12 Bonds *(needs #8)*
5. #9 Kill Switch *(needs #7, #8)*
6. #20 Replay view with commitment check
7. #18 Leaderboard *(needs #13)*

## Critical path

`#2 scaffold → #4 spike → #5 Vault+Mandate → #8 first trade → #12 Bonds → #13 Momentum+Allocator / #15 Overshoot → #16 demo Overshoot`, in parallel with `#3 → #6 → #7` for the money round trip.

- Day 1: C on #2, A on #3, B helps C finish #2, then starts #4 the moment it lands.
- Until #5 lands, A and C pair on it (contracts and form UI); B starts the Mandate Check against the fake ports.
- After #8, all three lanes run in parallel.
- Start #23 (continuous testnet run) as soon as #14 and #15 close; the track record needs days.

## Starting your agent

Take a lane, put your name next to it above, then paste this into your agent (swap in your lane letter and name):

```text
I own Lane <A|B|C> (<lane name>) on hackmatrix-26. Read CLAUDE.md, GLOSSARY.md,
docs/adr/, docs/team-map.md, and spec issue #1 (gh issue view 1). Then list every
ticket in my lane's queue with its current state:
  gh issue view <n> --json number,title,state,assignees,blockedBy
plus open PRs (gh pr list). Pick the first ticket in my queue that is open,
unassigned, and has no open blockers. Claim it, branch <lane>/<n>-<slug>, and
follow the Agent workflow in CLAUDE.md. Ask me before changing any interface
another lane consumes.
```

The agent picks up everything else (spec, ADRs, ticket bodies, blockers, PRs) from the repo and `gh`.

## Working rules

- Read `GLOSSARY.md` and `docs/adr/` before starting. Use glossary terms in code and PRs.
- Changing an interface you own (ABI, event types, port interface) needs a heads-up to the consuming lanes first.
- A ticket is done when its acceptance criteria pass, including a real testnet check where the ticket asks for one.
