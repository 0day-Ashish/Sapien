# Mandate enforced in the execution engine, provable onchain

CoreWriter cannot place trigger (stop-loss) orders, and a Hyperliquid agent wallet can open any position, so a HyperEVM contract cannot truly enforce a Mandate. The Mandate Check runs in the execution engine before the agent wallet signs. Mandate Versions and a hash of every decision are committed onchain before each order, so any breach can be audited. The pitch is "enforced before signing, provable onchain", not "the contract enforces it". A TEE (stretch) is what later makes "the engine can't skip the check" credible.

## Considered Options

- Send entries through CoreWriter with an onchain check: rejected. The agent wallet could still trade around it, CoreWriter adds a delay of a few seconds, and failed actions are dropped silently.
