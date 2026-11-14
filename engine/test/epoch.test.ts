import { describe, expect, it } from "vitest";
import { createEngine } from "../src/index.js";
import { perpFlowUsdc } from "../src/adapters/hyperliquid.js";
import { premiumRate, riskTier, toPpm } from "../src/premium.js";
import { defaultMandate, fakePorts } from "../src/testing/fakes.js";

const DAY = 86_400_000;
const T0 = 10 * DAY;

function setup() {
  const ports = fakePorts();
  let clock = T0;
  const engine = createEngine(ports, { now: () => clock });
  ports.exchange.accountValueByVault.set("vault-1", 1_000);
  return { ...ports, engine, advance: (ms: number) => (clock += ms) };
}

describe("premium rate", () => {
  it("is k x leverage x volatility / stop-loss distance, from the most volatile allowed asset", () => {
    // 0.0001 x 3 x 0.03 / 0.02 = 4.5 bps
    expect(premiumRate(defaultMandate, { BTC: 0.02, ETH: 0.03, SOL: 0.5 })).toBeCloseTo(0.00045);
    expect(toPpm(0.00045)).toBe(450);
  });
  it("is zero without a volatility reading for any allowed asset", () => {
    expect(premiumRate(defaultMandate, { SOL: 0.05 })).toBe(0);
  });
  it("tiers: Low below 3 bps, Medium below 8 bps, High from 8 bps (as the FeeRouter)", () => {
    expect(riskTier(0.00029)).toBe("low");
    expect(riskTier(0.0003)).toBe("medium");
    expect(riskTier(0.00079)).toBe("medium");
    expect(riskTier(0.0008)).toBe("high");
  });
});

describe("Epoch tick", () => {
  it("settles each allocated Vault under its Lead Agent, with value, flows, notional and the recalibrated premium", async () => {
    const { engine, exchange, chain } = setup();
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", reason: "trend" });
    exchange.flowsByVault.set("vault-1", [
      { usdc: 500, at: T0 - DAY / 2 },
      { usdc: -100, at: T0 - DAY / 4 },
      { usdc: 999, at: T0 - 2 * DAY }, // before this Epoch
    ]);
    exchange.fillsByVault.set("vault-1", [
      { orderId: "1", price: 2_000, size: 0.5, at: T0 - 3_600_000 },
      { orderId: "2", price: 2_100, size: -0.5, at: T0 - 1_800_000 },
      { orderId: "0", price: 1_000, size: 1, at: T0 - 2 * DAY }, // before this Epoch
    ]);

    const result = await engine.handle({ type: "epoch-tick", epoch: 7, dailyVolatility: { ETH: 0.03, BTC: 0.02 } });

    expect(result).toMatchObject({ kind: "epoch-settled", epoch: 7, failed: [], switched: [] });
    expect(chain.epochSettlements).toEqual([
      { vaultId: "vault-1", epoch: 7, valueUsdc: 1_000, netFlowsUsdc: 400, agentId: "momentum", premiumRate: expect.closeTo(0.00045, 8), tradedNotionalUsdc: 2_050 },
    ]);
  });

  it("measures the next Epoch from the last settlement", async () => {
    const { engine, exchange, chain, advance } = setup();
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", reason: "trend" });
    await engine.handle({ type: "epoch-tick", epoch: 1, dailyVolatility: {} });
    advance(DAY);
    exchange.flowsByVault.set("vault-1", [{ usdc: 50, at: T0 - 1 }, { usdc: 20, at: T0 + 1 }]);
    await engine.handle({ type: "epoch-tick", epoch: 2, dailyVolatility: {} });
    expect(chain.epochSettlements[1]).toMatchObject({ epoch: 2, netFlowsUsdc: 20 });
  });

  it("applies a pending Lead Agent switch on a Flat Vault, after settling under the outgoing agent", async () => {
    const { engine, chain } = setup();
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", pendingLeadAgentId: "mean-reversion", reason: "chop" });

    const result = await engine.handle({ type: "epoch-tick", epoch: 3, dailyVolatility: {} });

    expect(chain.epochSettlements[0]!.agentId).toBe("momentum");
    expect(result).toMatchObject({ kind: "epoch-settled", switched: ["vault-1"] });
    expect(engine.vaultStatus("vault-1").leadAgent).toEqual({ agentId: "mean-reversion", reason: "chop" });
  });

  it("keeps a pending switch waiting while the Vault holds a position", async () => {
    const { engine, exchange } = setup();
    exchange.positionsByVault.set("vault-1", [{ asset: "ETH", size: 0.5, entryPrice: 2_000 }]);
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", pendingLeadAgentId: "mean-reversion", reason: "chop" });

    const result = await engine.handle({ type: "epoch-tick", epoch: 3, dailyVolatility: {} });

    expect(result).toMatchObject({ switched: [] });
    expect(engine.vaultStatus("vault-1").leadAgent).toMatchObject({ agentId: "momentum", pendingAgentId: "mean-reversion" });
  });

  it("one Vault failing doesn't stop the others, and still applies its switch", async () => {
    const { engine, chain } = setup();
    chain.failSettlementFor.add("vault-1");
    await engine.handle({ type: "allocation", vaultId: "vault-1", leadAgentId: "momentum", pendingLeadAgentId: "funding-arb", reason: "skew" });
    await engine.handle({ type: "allocation", vaultId: "vault-2", leadAgentId: "momentum", reason: "trend" });

    const result = await engine.handle({ type: "epoch-tick", epoch: 4, dailyVolatility: {} });

    expect(result).toMatchObject({ failed: [{ vaultId: "vault-1", error: "FeeRouter.settleEpoch reverted" }], switched: ["vault-1"] });
    expect(chain.epochSettlements.map((s) => s.vaultId)).toEqual(["vault-2"]);
  });
});

describe("HyperCore ledger flows", () => {
  const vault = "0x18c3010518ce86d2381600CE3086F882b308d3b4";
  it("counts what reaches the perp balance (testnet ledger of a real Vault)", () => {
    expect(perpFlowUsdc({ type: "internalTransfer", usdc: "4.744901", user: "0x32c0bce52f64b99acae8bfb6bb91f8accce28036", destination: vault.toLowerCase(), fee: "1.0" }, vault)).toBeCloseTo(3.744901);
    expect(perpFlowUsdc({ type: "accountClassTransfer", usdc: "3.744901", toPerp: false }, vault)).toBeCloseTo(-3.744901);
    expect(perpFlowUsdc({ type: "spotTransfer", usdcValue: "3.7", user: vault, destination: "0x2000000000000000000000000000000000000000" }, vault)).toBe(0);
  });
  it("counts deposits, withdrawals and perp sends both ways", () => {
    expect(perpFlowUsdc({ type: "deposit", usdc: "10" }, vault)).toBe(10);
    expect(perpFlowUsdc({ type: "withdraw", usdc: "4", fee: "1" }, vault)).toBe(-4);
    expect(perpFlowUsdc({ type: "accountClassTransfer", usdc: "2", toPerp: true }, vault)).toBe(2);
    expect(perpFlowUsdc({ type: "internalTransfer", usdc: "3", user: vault, destination: "0xabc", fee: "0" }, vault)).toBe(-3);
    expect(perpFlowUsdc({ type: "send", usdcValue: "5", user: "0xabc", destination: vault, sourceDex: "", destinationDex: "" }, vault)).toBe(5);
    expect(perpFlowUsdc({ type: "send", usdcValue: "5", user: "0xabc", destination: vault, sourceDex: "", destinationDex: "spot" }, vault)).toBe(0);
    expect(perpFlowUsdc({ type: "liquidation" }, vault)).toBe(0);
  });
});
