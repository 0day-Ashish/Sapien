import { afterEach, describe, expect, it } from "vitest";
import { createEngine, hashDecision, startHttp, type RunnerRecord } from "../src/index.js";
import { AgentWalletStore } from "../src/service/agent-wallets.js";
import { fakePorts } from "../src/testing/fakes.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

async function serve(history: RunnerRecord[]) {
  const http = await startHttp({ port: 0, agentWallets: new AgentWalletStore("/nonexistent/agent-wallets.json"), history: () => history });
  close = http.close;
  return (path: string) => fetch(`${http.url}${path}`).then((r) => r.json() as Promise<{ items: RunnerRecord[] }>);
}

async function executedRecord(vaultId: string, proposalId: string): Promise<RunnerRecord> {
  const ports = fakePorts();
  ports.exchange.marks.set("BTC", 65_000);
  const engine = createEngine(ports);
  const proposal = {
    type: "trade-proposal" as const,
    proposalId,
    vaultId,
    agentId: "momentum",
    asset: "BTC",
    side: "long" as const,
    size: 0.001,
    leverage: 2,
    intent: "open" as const,
    confidence: 0.7,
    rationale: "breakout",
  };
  const result = await engine.handle(proposal);
  return { at: 1, vaultId, asset: "BTC", proposal, result };
}

describe("GET /decisions", () => {
  it("serves executed decisions newest first, with the full record whose hash replay can recompute", async () => {
    const a = await executedRecord("0xA", "p-1");
    const b = await executedRecord("0xB", "p-2");
    const skipped: RunnerRecord = { at: 2, vaultId: "0xA", asset: "BTC", note: "no proposal" };
    const get = await serve([a, skipped, b]);

    const { items } = await get("/decisions");
    expect(items.map((r) => r.proposal?.proposalId)).toEqual(["p-2", "p-1"]);
    const r = items[1]!.result as Extract<RunnerRecord["result"], { kind: "executed" }>;
    expect(hashDecision(r.decision)).toBe(r.decisionHash);
  });

  it("filters by Vault and by decision hash", async () => {
    const a = await executedRecord("0xA", "p-1");
    const b = await executedRecord("0xB", "p-2");
    const get = await serve([a, b]);
    const hashB = (b.result as { decisionHash: string }).decisionHash;

    expect((await get("/decisions?vault=0xa")).items.map((r) => r.proposal?.proposalId)).toEqual(["p-1"]);
    expect((await get(`/decisions?hash=${hashB.toUpperCase()}`)).items.map((r) => r.proposal?.proposalId)).toEqual(["p-2"]);
  });
});
