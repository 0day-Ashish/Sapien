# Agentic Perps Vault (hackmatrix-26)

- **Spec**: GitHub issue #1 (source of truth). The original brief is `Agentic Perps Vault BRIEF.md`; where the brief and ADRs disagree, the ADRs win.
- **Tickets**: #2–#23, sub-issues of #1, with native "blocked by" links.
- **Who does what**: `docs/team-map.md` (lanes A/B/C, queues, owned interfaces).

## Agent workflow

1. Read `GLOSSARY.md`, `docs/adr/`, `docs/team-map.md` and spec #1 before any work. Use glossary terms in code, commits and PRs.
2. Work only your lane's queue, in order. A ticket is startable when it has no open blockers (`gh issue view <n> --json blockedBy`) and no assignee.
3. Claim it first: `gh issue edit <n> --add-assignee @me`.
4. Branch `<lane>/<n>-<slug>` (e.g. `b/8-first-guarded-trade`). Never commit to `main` directly.
5. Test through the spec's seams only: engine `handle(event)` with fake ports, contract public functions (Foundry), testnet smoke script. No mocks inside the system.
6. Open a PR with `Closes #<n>` and `Part of #1` in the body. Tick the ticket's acceptance criteria and include testnet tx/order IDs where the ticket asks for a real check. Request review from the lane that owns any interface you touched.
7. Changing an interface your lane owns (ABIs/events, `handle(event)`/ports, UI data contracts)? Comment on the affected open tickets first.
8. Before starting, check open PRs (`gh pr list`) for work your ticket builds on.

## Agent skills

### Issue tracker

GitHub Issues on `0day-Ashish/hackmatrix-26` via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
