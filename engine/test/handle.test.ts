import { describe, expect, it } from "vitest";
import { createEngine } from "../src/index.js";
import { fakePorts } from "../src/testing/fakes.js";

describe("handle(event) seam", () => {
  it("runs a Trade Proposal against the fake ports (empty engine sends nothing yet)", async () => {
    const ports = fakePorts();
    const engine = createEngine(ports);

    await engine.handle({
      type: "trade-proposal",
      vaultId: "vault-1",
      agentId: "momentum",
      asset: "BTC",
      side: "long",
      size: 0.01,
      leverage: 2,
      confidence: 0.7,
      rationale: "breakout above 4h range",
    });

    expect(ports.exchange.orders).toEqual([]);
    expect(ports.chain.commitments).toEqual([]);
  });
});
