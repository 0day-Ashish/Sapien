import { describe, expect, it } from "vitest";
import { DEMO_BOND, DEMO_LEADERBOARD, demoReplayItems } from "../lib/demo/sidebar-demo";
import { verifyDecision } from "../lib/engine/replay";

describe("Sidebar demo content", () => {
  it("ranks the demo leaderboard by risk-adjusted return, as the engine does", () => {
    const values = DEMO_LEADERBOARD.map((r) => r.riskAdjustedReturn.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("gives every demo decision a real hash, so the commitment check passes and tampering fails", async () => {
    const items = await demoReplayItems(1_700_000_000_000);
    expect(items).toHaveLength(3);
    for (const item of items) {
      const own = async (h: string) => [h === item.result.decisionHash, BigInt(1)] as const;
      expect((await verifyDecision(item.result.decision, item.result.decisionHash, own)).verified).toBe(true);
      const tampered = { ...item.result.decision, proposal: { ...item.result.decision.proposal, size: 9 } };
      expect((await verifyDecision(tampered, item.result.decisionHash, own)).verified).toBe(false);
    }
  });

  it("keeps the demo Bond at or above its Bond Minimum (5% of the Vaults it leads)", () => {
    expect(DEMO_BOND.bondMinimumUsdc).toBe(DEMO_BOND.ledValueUsdc * 0.05);
    expect(DEMO_BOND.bondUsdc).toBeGreaterThanOrEqual(DEMO_BOND.bondMinimumUsdc);
  });
});
