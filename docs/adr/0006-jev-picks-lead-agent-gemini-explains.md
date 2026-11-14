# Jev picks the Lead Agent among rule-eligible agents; Gemini writes rationales

Spec #1 and #13 had the Allocator score agents by Bond × risk-adjusted return and Claude write the agent's-eye-view rationale. We now let Jev (TypeSafe AI's decision model) choose the Lead Agent, and Gemini write the rationale. Rules still bound Jev: only agents that declare the current Regime and meet their Bond Minimum are offered to it, a switch still waits until the Vault is Flat (ADR-0001), and if Jev errors or answers outside the eligible set, the Bond × Sharpe rule decides. Jev's probabilities are shown as the reason for the choice. Specialist Agents still trade on deterministic rules (ADR-0005), so Gemini's text never changes a trade and a model can't trigger a Bond slash.

## Considered Options

- Letting Gemini decide trades: rejected. Replays would no longer reproduce exactly, and an LLM call could cause the Overshoot that slashes a Bond.
- Letting Jev also classify the Regime: not now. The fixed volatility, trend and funding thresholds stay, so eligibility is reproducible.
