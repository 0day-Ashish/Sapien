import { describe, expect, it } from "vitest";
import { bondStatus, canStartUnbonding, regimeLabels, type AgentBond } from "../lib/agents/bonds";

const base: AgentBond = {
  builder: "0x0000000000000000000000000000000000000001",
  regimes: 1,
  bond: BigInt(100e6),
  unbondingEndsAt: BigInt(0),
  ledVaults: 0,
  ledValue: BigInt(0),
  bondMinimum: BigInt(0),
  meetsBondMinimum: true,
};
const now = BigInt(1_000_000);

describe("Builder Bond status", () => {
  it("is eligible at or above the Bond Minimum", () => {
    expect(bondStatus({ ...base, ledVaults: 1, ledValue: BigInt(2_000e6), bondMinimum: BigInt(100e6) }, now)).toEqual({ kind: "eligible" });
  });

  it("shows how far below the Bond Minimum the agent is", () => {
    expect(bondStatus({ ...base, bondMinimum: BigInt(150e6) }, now)).toEqual({ kind: "below-minimum", shortBy: BigInt(50e6) });
  });

  it("counts down Unbonding, then allows withdrawal", () => {
    const unbonding = { ...base, unbondingEndsAt: now + BigInt(10) };
    expect(bondStatus(unbonding, now)).toMatchObject({ kind: "unbonding" });
    expect(bondStatus(unbonding, now + BigInt(10))).toEqual({ kind: "withdrawable" });
  });

  it("allows Unbonding only while leading no Vault", () => {
    expect(canStartUnbonding(base)).toBe(true);
    expect(canStartUnbonding({ ...base, ledVaults: 1 })).toBe(false);
    expect(canStartUnbonding({ ...base, bond: BigInt(0) })).toBe(false);
    expect(canStartUnbonding({ ...base, unbondingEndsAt: now })).toBe(false);
  });

  it("names the declared Regimes", () => {
    expect(regimeLabels(1 | 8)).toEqual(["Trend", "Funding skew"]);
  });
});
