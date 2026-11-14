import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentWalletStore } from "../src/service/agent-wallets.js";
import { startHttp } from "../src/service/http.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "agent-wallets-")), "agent-wallets.json");

describe("Agent Wallet store", () => {
  it("creates a fresh wallet each time (one Agent Wallet per Vault: Hyperliquid ties an agent to one account)", () => {
    const store = new AgentWalletStore(tmp());
    const a = store.create();
    const b = store.create();
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(a).not.toBe(b);
  });

  it("persists keys so the engine can sign for the Vault after a restart, readable only by the owner", () => {
    const file = tmp();
    const address = new AgentWalletStore(file).create();
    const reopened = new AgentWalletStore(file);
    expect(reopened.account(address).address).toBe(address);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("finds a wallet by address, case-insensitively, and refuses unknown ones", () => {
    const store = new AgentWalletStore(tmp());
    const address = store.create();
    expect(store.account(address.toLowerCase()).address).toBe(address);
    expect(() => store.account("0x0000000000000000000000000000000000000001")).toThrow(/unknown Agent Wallet/i);
  });

  it("never writes the key into anything but its own file", () => {
    const file = tmp();
    const store = new AgentWalletStore(file);
    const address = store.create();
    expect(JSON.stringify(store.list())).not.toMatch(/privateKey|0x[0-9a-f]{64}/);
    expect(readFileSync(file, "utf8")).toMatch(/0x[0-9a-f]{64}/);
    expect(store.list()).toEqual([{ address, createdAt: expect.any(Number) }]);
  });
});

describe("Binding Agent Wallets to Vaults", () => {
  it("gives the exchange adapter the right signer for a Vault, after a restart too", () => {
    const file = tmp();
    const store = new AgentWalletStore(file);
    const a = store.create();
    const b = store.create();
    store.bind("0xVaultA", a);
    store.bind("0xVaultB", b);

    const reopened = new AgentWalletStore(file);
    expect(reopened.forVault("0xvaulta").address).toBe(a);
    expect(reopened.forVault("0xVaultB").address).toBe(b);
    expect(() => reopened.forVault("0xVaultC")).toThrow(/No Agent Wallet bound/);
  });

  it("refuses to bind one Agent Wallet to two Vaults, or an unknown wallet", () => {
    const store = new AgentWalletStore(tmp());
    const a = store.create();
    store.bind("0xVaultA", a);
    store.bind("0xVaultA", a); // idempotent
    expect(() => store.bind("0xVaultB", a)).toThrow(/already trades for/);
    expect(() => store.bind("0xVaultB", "0x0000000000000000000000000000000000000002")).toThrow(/Unknown/);
  });
});

describe("Engine HTTP: POST /agent-wallets", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it("returns a fresh Agent Wallet address for the UI's createVault call, with CORS for the frontend", async () => {
    const store = new AgentWalletStore(tmp());
    const server = await startHttp({ port: 0, agentWallets: store, allowOrigin: "http://localhost:3000" });
    close = server.close;

    const res = await fetch(`${server.url}/agent-wallets`, { method: "POST", headers: { origin: "http://localhost:3000" } });
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const body = (await res.json()) as { address: string };
    expect(body.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(store.account(body.address).address).toBe(body.address);
  });

  it("answers CORS preflight and 404s anything else", async () => {
    const server = await startHttp({ port: 0, agentWallets: new AgentWalletStore(tmp()) });
    close = server.close;
    expect((await fetch(`${server.url}/agent-wallets`, { method: "OPTIONS" })).status).toBe(204);
    expect((await fetch(`${server.url}/nope`)).status).toBe(404);
  });
});
