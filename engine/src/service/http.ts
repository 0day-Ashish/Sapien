// The engine's small HTTP surface for the UI. Starts with Agent Wallets; the agent's-eye feed and Vault status
// (#31) are meant to join it.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { HandleResult, VaultStatus } from "../engine.js";
import { BindingError, type VaultService } from "../near/vaults.js";
import type { RunnerRecord } from "../runner/runner.js";
import type { AgentWalletStore } from "./agent-wallets.js";
import type { LeaderboardRow } from "./leaderboard.js";

export type HttpOptions = {
  port: number;
  host?: string;
  agentWallets: AgentWalletStore;
  /** The frontend's origin, for CORS. Default: any origin (testnet demo). */
  allowOrigin?: string;
  /** Recent runner records, newest last: the agent's-eye view feed. */
  feed?: () => RunnerRecord[];
  /** Every runner record kept on disk, oldest first: replay reads executed decisions from here (#20). */
  history?: () => RunnerRecord[];
  /** NEAR accounts' Vaults: binding and Mandate publishing (src/near/vaults.ts). Without it the /near routes 404. */
  nearVaults?: VaultService;
  /** The public leaderboard of Specialist Agents (#18). */
  leaderboard?: () => Promise<LeaderboardRow[]>;
  /** A Vault's protection and Lead Agent state, including trades waiting in their Veto Window. */
  vaultStatus?: (vaultId: string) => VaultStatus;
  /** Cancels a trade waiting in its Veto Window (sends a `veto` event through handle). */
  veto?: (vaultId: string, proposalId: string) => Promise<HandleResult>;
  /** Kill Switch (sends a `kill-switch` event). The engine acts only if the kill flag is already set onchain. */
  kill?: (vaultId: string) => Promise<HandleResult>;
};

export async function startHttp(o: HttpOptions) {
  const server = createServer((req, res) => {
    cors(res, o.allowOrigin);
    route(req, res, o).catch((e) => send(res, e instanceof BindingError ? e.status : 500, { error: (e as Error).message }));
  });
  await new Promise<void>((resolve) => server.listen(o.port, o.host ?? "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${o.host ?? "127.0.0.1"}:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function route(req: IncomingMessage, res: ServerResponse, o: HttpOptions) {
  if (req.method === "OPTIONS") return send(res, 204);
  const path = new URL(req.url ?? "/", "http://engine").pathname;

  // The UI calls this right before VaultFactory.createVault(agentWallet).
  if (req.method === "POST" && path === "/agent-wallets") return send(res, 201, { address: o.agentWallets.create() });

  // NEAR accounts (ADR-0007). POST /near/vaults { account } → { account, evmVault, agentWallet } (201 when it was just
  // created, 200 if it already existed); GET /near/vaults/:account → same, or 404;
  // POST /near/mandate { account, mandate } → { mandateHash, txHash }, or 409 if the hash isn't the one committed on NEAR.
  if (o.nearVaults) {
    if (req.method === "POST" && path === "/near/vaults") {
      const { account } = (await readJson(req)) as { account?: unknown };
      const { binding, created } = await o.nearVaults.bind(account);
      return send(res, created ? 201 : 200, binding);
    }
    const vault = path.match(/^\/near\/vaults\/([^/]+)$/);
    if (req.method === "GET" && vault) {
      const binding = await o.nearVaults.get(decodeURIComponent(vault[1]!));
      return binding ? send(res, 200, binding) : send(res, 404, { error: "No Vault for that NEAR account" });
    }
    if (req.method === "POST" && path === "/near/mandate") {
      const body = (await readJson(req)) as { account?: unknown; mandate?: unknown };
      return send(res, 200, await o.nearVaults.publishMandate(body.account, body.mandate));
    }
  }

  // Agent's-eye view feed, newest first: GET /feed?vault=0x…&limit=50
  if (req.method === "GET" && path === "/feed" && o.feed) {
    const q = new URL(req.url ?? "/", "http://engine").searchParams;
    const vault = q.get("vault")?.toLowerCase();
    const limit = Math.min(500, Number(q.get("limit") ?? 50));
    const items = o.feed().filter((r) => !vault || r.vaultId.toLowerCase() === vault).slice(-limit).reverse();
    return send(res, 200, { items });
  }

  // Executed decisions for replay, newest first: GET /decisions?vault=0x…&limit=200 (or ?hash=0x… for one)
  if (req.method === "GET" && path === "/decisions" && (o.history ?? o.feed)) {
    const q = new URL(req.url ?? "/", "http://engine").searchParams;
    const vault = q.get("vault")?.toLowerCase();
    const hash = q.get("hash")?.toLowerCase();
    const limit = Math.min(1000, Number(q.get("limit") ?? 200));
    const items = (o.history ?? o.feed)!()
      .filter((r) => r.result?.kind === "executed")
      .filter((r) => !vault || r.vaultId.toLowerCase() === vault)
      .filter((r) => !hash || (r.result as { decisionHash: string }).decisionHash.toLowerCase() === hash)
      .slice(-limit)
      .reverse();
    return send(res, 200, { items });
  }

  // GET /leaderboard → { rows: LeaderboardRow[], at }
  if (req.method === "GET" && path === "/leaderboard" && o.leaderboard) return send(res, 200, { rows: await o.leaderboard(), at: Date.now() });

  // GET /vaults/0x…/status → { automaticKill?, leadAgent? }
  const status = path.match(/^\/vaults\/([^/]+)\/status$/);
  if (req.method === "GET" && status && o.vaultStatus) return send(res, 200, o.vaultStatus(status[1]!));

  // POST /vaults/0x…/veto { proposalId } → { kind: "vetoed" } or 409 if the window already ended
  const veto = path.match(/^\/vaults\/([^/]+)\/veto$/);
  if (req.method === "POST" && veto && o.veto) {
    const body = (await readJson(req)) as { proposalId?: unknown };
    if (typeof body.proposalId !== "string" || !body.proposalId) return send(res, 400, { error: "proposalId is required" });
    const result = await o.veto(veto[1]!, body.proposalId);
    return send(res, result.kind === "vetoed" ? 200 : 409, result.kind === "vetoed" ? result : { error: "No open Veto Window for that proposal" });
  }

  // POST /vaults/0x…/kill → { kind: "killed", closes, flat } or 409 { kind: "kill-refused", reason }
  const kill = path.match(/^\/vaults\/([^/]+)\/kill$/);
  if (req.method === "POST" && kill && o.kill) {
    const result = await o.kill(kill[1]!);
    return send(res, result.kind === "killed" ? 200 : 409, result);
  }

  send(res, 404, { error: `No route ${req.method} ${path}` });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("Request body too large");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function cors(res: ServerResponse, origin = "*") {
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
