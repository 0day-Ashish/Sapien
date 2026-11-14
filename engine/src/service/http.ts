// The engine's small HTTP surface for the UI. Starts with Agent Wallets; the agent's-eye feed and Vault status
// (#31) are meant to join it.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AgentWalletStore } from "./agent-wallets.js";

export type HttpOptions = {
  port: number;
  host?: string;
  agentWallets: AgentWalletStore;
  /** The frontend's origin, for CORS. Default: any origin (testnet demo). */
  allowOrigin?: string;
};

export async function startHttp(o: HttpOptions) {
  const server = createServer((req, res) => {
    cors(res, o.allowOrigin);
    route(req, res, o).catch((e) => send(res, 500, { error: (e as Error).message }));
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

  send(res, 404, { error: `No route ${req.method} ${path}` });
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
