import { describe, expect, it } from "vitest";
import { executionRate, fetchLeaderboard, formatRar, withOnchain, type LeaderboardRow } from "../lib/engine/leaderboard";

const row = (over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  agentId: "momentum",
  regimes: ["trend"],
  bondUsdc: 1_000,
  riskAdjustedReturn: { value: 2.314, usedPrior: false, epochs: 4 },
  vaultsLed: ["0xV"],
  proposals: 4,
  executed: 3,
  rejected: 1,
  fills: 5,
  filledNotionalUsdc: 820,
  ...over,
});

describe("Leaderboard", () => {
  it("takes Bond and Vaults led from the chain when the agent is registered there", () => {
    const [onchain, engineOnly] = withOnchain(
      [row(), row({ agentId: "funding-arb", bondUsdc: 600, vaultsLed: [] })],
      new Map([["momentum", { bond: BigInt(1_250_500_000), ledVaults: 2, registered: true }]]),
    );
    expect(onchain).toMatchObject({ bondUsdc: 1250.5, vaultsLedCount: 2, bondSource: "onchain" });
    expect(engineOnly).toMatchObject({ bondUsdc: 600, vaultsLedCount: 0, bondSource: "engine" });
  });

  it("labels the prior for agents without a track record", () => {
    expect(formatRar({ value: 2.314, usedPrior: false, epochs: 4 })).toBe("2.31");
    expect(formatRar({ value: 0.5, usedPrior: true, epochs: 0 })).toBe("0.50 (prior)");
  });

  it("shows the share of proposals executed", () => {
    expect(executionRate(row())).toBe("75%");
    expect(executionRate(row({ proposals: 0, executed: 0 }))).toBe("–");
  });

  it("reads the board from the engine", async () => {
    const reply = (async () => new Response(JSON.stringify({ rows: [row()], at: 7 }))) as unknown as typeof fetch;
    expect(await fetchLeaderboard(reply)).toEqual({ rows: [row()], at: 7 });
  });
});
