import { describe, expect, it } from "vitest";
import { createEngine, createNearLink } from "../src/index.js";
import { createRunner } from "../src/runner/runner.js";
import type { EpochSettlement } from "../src/ports.js";
import { defaultMandate, fakePorts } from "../src/testing/fakes.js";
import { FakeNear } from "../src/testing/near.js";

const HASH = `0x${"ab".repeat(32)}`;

function setup(accountOf: (v: string) => string | undefined = () => "alice.testnet") {
  const ports = fakePorts();
  const near = new FakeNear();
  near.vaults.set("alice.testnet", { evmVault: "vault-1", mandateHash: null, killed: false, deposited: 0n, withdrawn: 0n });
  const logs: string[] = [];
  const link = createNearLink({ near, accountOf, log: (m) => logs.push(m), killTtlMs: 0 });
  return { ports, near, link, logs, chain: link.wrap(ports.chain) };
}

describe("NEAR link: Decision Commitments", () => {
  it("also logs the same hash on NEAR", async () => {
    const { chain, near, ports } = setup();
    await chain.commitDecision({ vaultId: "vault-1", agentId: "momentum", decisionHash: HASH });
    await new Promise((r) => setTimeout(r, 0));
    expect(ports.chain.commitments).toHaveLength(1);
    expect(near.decisions).toEqual([{ account: "alice.testnet", agentId: "momentum", hash: HASH }]);
  });

  it("a NEAR failure is logged and the commitment still succeeds", async () => {
    const { chain, near, logs } = setup();
    near.failLogDecision = true;
    await expect(chain.commitDecision({ vaultId: "vault-1", agentId: "momentum", decisionHash: HASH })).resolves.toHaveProperty("txHash");
    await new Promise((r) => setTimeout(r, 0));
    expect(logs[0]).toContain("log_decision failed");
  });

  it("a Vault with no NEAR account is left alone", async () => {
    const { chain, near } = setup(() => undefined);
    await chain.commitDecision({ vaultId: "vault-1", agentId: "momentum", decisionHash: HASH });
    expect(near.decisions).toEqual([]);
  });
});

describe("NEAR link: Kill Switch", () => {
  it("reads as a kill flag, so the engine's Kill Switch closes every position", async () => {
    const { ports, near, link } = setup();
    ports.exchange.marks.set("BTC", 65_000);
    ports.exchange.positionsByVault.set("vault-1", [{ asset: "BTC", size: 0.02, entryPrice: 64_000 }]);
    const engine = createEngine({ exchange: ports.exchange, chain: link.wrap(ports.chain) });

    // Before the user hits it, the engine refuses.
    expect((await engine.handle({ type: "kill-switch", vaultId: "vault-1" })).kind).toBe("kill-refused");

    near.vaults.get("alice.testnet")!.killed = true;
    expect(await link.isKilled("vault-1")).toBe(true);
    const result = await engine.handle({ type: "kill-switch", vaultId: "vault-1" });
    expect(result).toMatchObject({ kind: "killed", closes: [{ asset: "BTC", side: "long" }] });
  });

  it("the runner sends the kill-switch when NEAR says killed, once, and logs it", async () => {
    const { ports, near, link } = setup();
    ports.exchange.marks.set("BTC", 65_000);
    ports.exchange.positionsByVault.set("vault-1", [{ asset: "BTC", size: 0.02, entryPrice: 64_000 }]);
    const engine = createEngine({ exchange: ports.exchange, chain: link.wrap(ports.chain) });
    const records: { note?: string; result?: { kind: string } }[] = [];
    const runner = createRunner({
      engine,
      exchange: ports.exchange,
      market: { snapshot: async () => { throw new Error("market must not be read once killed"); } },
      vaults: [{ vaultId: "vault-1", asset: "BTC" }],
      roster: [],
      agents: [],
      select: async () => { throw new Error("unused"); },
      isKilled: link.isKilled,
      log: (r) => records.push(r),
    });

    near.vaults.get("alice.testnet")!.killed = true;
    await runner.tick();
    await runner.tick();
    expect(records[0]).toMatchObject({ result: { kind: "killed" }, note: "Kill Switch (set on NEAR)" });
    expect(records[1]).toMatchObject({ note: "Kill Switch is set: trading frozen" });
    expect(ports.exchange.reduceOnlyOrders).toHaveLength(1);
  });

  it("keeps the last reading when NEAR can't be read", async () => {
    const { near, link, logs } = setup();
    near.vaults.get("alice.testnet")!.killed = true;
    expect(await link.isKilled("vault-1")).toBe(true);
    near.vaultOf = async () => {
      throw new Error("rpc");
    };
    expect(await link.isKilled("vault-1")).toBe(true);
    expect(logs[0]).toContain("vault_of");
  });

  it("an unkilled Vault keeps its Mandate as is", async () => {
    const { chain } = setup();
    expect(await chain.currentMandate("vault-1")).toEqual(defaultMandate);
  });
});

describe("NEAR link: agent payouts", () => {
  const settlement: EpochSettlement = { vaultId: "vault-1", epoch: 7, valueUsdc: 100, netFlowsUsdc: 0, agentId: "momentum", premiumRate: 0.001, tradedNotionalUsdc: 0 };

  it("pays the Builder share to a registered agent's NEAR account", async () => {
    const { ports, near, chain } = setup();
    ports.chain.builderShare = 1_200_000n;
    await chain.settleEpoch(settlement);
    expect(near.agentPayouts).toEqual([{ agentId: "momentum", amount: 1_200_000n, memo: "epoch 7" }]);
  });

  it("skips unknown agents and zero shares", async () => {
    const { ports, near, chain } = setup();
    ports.chain.builderShare = 1_200_000n;
    await chain.settleEpoch({ ...settlement, agentId: "sentiment" });
    ports.chain.builderShare = 0n;
    await chain.settleEpoch(settlement);
    expect(near.agentPayouts).toEqual([]);
  });

  it("a pay_agent failure is logged and settlement still succeeds", async () => {
    const { ports, near, chain, logs } = setup();
    ports.chain.builderShare = 5n;
    near.failPayAgent = true;
    await expect(chain.settleEpoch(settlement)).resolves.toEqual({ builderSubunits: 5n });
    expect(logs[0]).toContain("pay_agent");
  });
});
