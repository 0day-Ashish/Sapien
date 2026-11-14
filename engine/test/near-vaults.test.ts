import { afterEach, describe, expect, it } from "vitest";
import type { Address } from "viem";
import { startHttp } from "../src/index.js";
import { MemoryState } from "../src/near/state.js";
import { createVaultService, mandateHash, NearVaultStore, type VaultBinding, type VaultEvmPorts } from "../src/near/vaults.js";
import { AgentWalletStore } from "../src/service/agent-wallets.js";
import { FakeNear } from "../src/testing/near.js";

const VAULT: Address = "0x00000000000000000000000000000000000000bb";
const WALLET: Address = "0x00000000000000000000000000000000000000cc";

const mandate = { allowedAssets: ["ETH"], leverageCap: 2.5, stopLossPct: 2, drawdownCapPct: 10, blackoutWindows: [], vetoThresholdUsdc: 100 };

function setup() {
  const near = new FakeNear();
  const created: Address[] = [];
  const published: { vault: Address; json: string; caps: unknown }[] = [];
  const evm: VaultEvmPorts = {
    createVault: async (w) => (created.push(w), VAULT),
    agentWalletOf: async () => WALLET,
    publishMandate: async (vault, json, caps) => (published.push({ vault, json, caps }), "0xtx"),
  };
  const bound: [string, string][] = [];
  const agentWallets = { create: () => WALLET, bind: (v: string, a: string) => void bound.push([v, a]) };
  const store = new NearVaultStore(new MemoryState<Record<string, VaultBinding>>({}));
  return { near, created, published, bound, store, service: createVaultService({ near, evm, agentWallets, store }) };
}

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function serve(service: ReturnType<typeof setup>["service"]) {
  const http = await startHttp({ port: 0, agentWallets: new AgentWalletStore("/nonexistent/agent-wallets.json"), nearVaults: service });
  close = http.close;
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${http.url}${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  return call;
}

describe("POST /near/vaults", () => {
  it("creates a Vault with a fresh Agent Wallet, registers it on NEAR, and is idempotent", async () => {
    const s = setup();
    const call = await serve(s.service);

    const first = await call("POST", "/near/vaults", { account: "alice.testnet" });
    expect(first).toEqual({ status: 201, body: { account: "alice.testnet", evmVault: VAULT, agentWallet: WALLET } });
    expect(s.created).toEqual([WALLET]);
    expect(s.bound).toEqual([[VAULT, WALLET]]);
    expect(s.near.registered).toEqual([{ account: "alice.testnet", evmVault: VAULT }]);

    const again = await call("POST", "/near/vaults", { account: "alice.testnet" });
    expect(again).toEqual({ status: 200, body: first.body });
    expect(s.created).toHaveLength(1);
    expect(s.near.registered).toHaveLength(1);
  });

  it("two simultaneous requests make one Vault", async () => {
    const s = setup();
    await Promise.all([s.service.bind("alice.testnet"), s.service.bind("alice.testnet")]);
    expect(s.created).toHaveLength(1);
  });

  it("resumes a half-finished binding instead of creating a second Vault", async () => {
    const s = setup();
    s.near.registerVault = async () => {
      throw new Error("near down");
    };
    await expect(s.service.bind("alice.testnet")).rejects.toThrow("near down");
    s.near.registerVault = FakeNear.prototype.registerVault.bind(s.near);
    await s.service.bind("alice.testnet");
    expect(s.created).toHaveLength(1);
    expect(s.near.registered).toEqual([{ account: "alice.testnet", evmVault: VAULT }]);
  });

  it("rejects a bad account id", async () => {
    const call = await serve(setup().service);
    expect((await call("POST", "/near/vaults", { account: "Not An Account!" })).status).toBe(400);
  });
});

describe("GET /near/vaults/:account", () => {
  it("returns the binding, or 404", async () => {
    const s = setup();
    const call = await serve(s.service);
    expect((await call("GET", "/near/vaults/alice.testnet")).status).toBe(404);
    await call("POST", "/near/vaults", { account: "alice.testnet" });
    expect(await call("GET", "/near/vaults/alice.testnet")).toEqual({ status: 200, body: { account: "alice.testnet", evmVault: VAULT, agentWallet: WALLET } });
  });
});

describe("POST /near/mandate", () => {
  const committed = (s: ReturnType<typeof setup>, hash: string | null) =>
    s.near.vaults.set("alice.testnet", { evmVault: VAULT, mandateHash: hash, killed: false, deposited: 0n, withdrawn: 0n });

  it("hashes sha256 over the JSON text", () => {
    expect(mandateHash({})).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"); // sha256("{}")
  });

  it("publishes the Mandate whose hash the user committed on NEAR", async () => {
    const s = setup();
    committed(s, mandateHash(mandate));
    const call = await serve(s.service);

    const r = await call("POST", "/near/mandate", { account: "alice.testnet", mandate });
    expect(r).toEqual({ status: 200, body: { mandateHash: mandateHash(mandate), txHash: "0xtx" } });
    expect(s.published).toEqual([
      { vault: VAULT, json: JSON.stringify(mandate), caps: { leverageCapE2: 250, stopLossBps: 200, drawdownCapBps: 1000, vetoThresholdUsdc: 100_000_000n } },
    ]);
  });

  it("refuses a Mandate that isn't the one committed (409) and publishes nothing", async () => {
    const s = setup();
    committed(s, mandateHash({ ...mandate, leverageCap: 1 }));
    const call = await serve(s.service);
    expect((await call("POST", "/near/mandate", { account: "alice.testnet", mandate })).status).toBe(409);
    expect(s.published).toEqual([]);
  });

  it("refuses when nothing was committed (409), when there is no Vault (404), or a malformed Mandate (400)", async () => {
    const s = setup();
    const call = await serve(s.service);
    expect((await call("POST", "/near/mandate", { account: "alice.testnet", mandate })).status).toBe(404);
    committed(s, null);
    expect((await call("POST", "/near/mandate", { account: "alice.testnet", mandate })).status).toBe(409);
    expect((await call("POST", "/near/mandate", { account: "alice.testnet", mandate: { leverageCap: 2 } })).status).toBe(400);
  });

  it("accepts a committed hash written with a 0x prefix or in upper case", async () => {
    const s = setup();
    committed(s, `0x${mandateHash(mandate).toUpperCase()}`);
    await expect(s.service.publishMandate("alice.testnet", mandate)).resolves.toMatchObject({ txHash: "0xtx" });
  });
});
