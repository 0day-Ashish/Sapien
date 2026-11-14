// Shared setup for the #4 spike scripts. Throwaway code: not part of the engine.
import { ApiRequestError, ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodePacked,
  type Hex,
  http,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const dir = new URL(".", import.meta.url).pathname;
export const ENV_PATH = `${dir}.env`;
const STATE_PATH = `${dir}state.json`;
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

export const hyperEvmTestnet = defineChain({
  id: 998,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] } },
});

export const transport = new HttpTransport({ isTestnet: true });
export const info = new InfoClient({ transport });
export const evm = createPublicClient({ chain: hyperEvmTestnet, transport: http() });

export const EXPLORER = "https://app.hyperliquid-testnet.xyz/explorer";
export const USDC_TOKEN = "USDC:0xeb62eee3685fc4c43992febcd9e75443";

// ---------- keys ----------

export function ensureKey(name: "OWNER_PRIVATE_KEY" | "AGENT_PRIVATE_KEY"): boolean {
  if (process.env[name]) return false;
  const key = generatePrivateKey();
  appendFileSync(ENV_PATH, `${existsSync(ENV_PATH) ? "\n" : ""}${name}=${key}\n`);
  process.env[name] = key;
  return true;
}

function key(name: string): Hex {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing in spikes/4-testnet/.env (run: npm run setup)`);
  return v as Hex;
}

export const owner = (): PrivateKeyAccount => privateKeyToAccount(key("OWNER_PRIVATE_KEY"));
export const agent = (): PrivateKeyAccount => privateKeyToAccount(key("AGENT_PRIVATE_KEY"));
export const exchange = (wallet: PrivateKeyAccount) => new ExchangeClient({ transport, wallet });
export const ownerEvm = () => createWalletClient({ account: owner(), chain: hyperEvmTestnet, transport: http() });

// ---------- state + findings ----------

type State = { contract?: Address; deployTx?: Hex; findings: Record<string, unknown> };

export function state(): State {
  return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { findings: {} };
}

export function save(patch: Partial<State>) {
  writeFileSync(STATE_PATH, JSON.stringify({ ...state(), ...patch }, null, 2));
}

/** Store a finding in state.json (it feeds the ticket comment) and print it. */
export function record(key: string, value: unknown) {
  const s = state();
  s.findings[key] = value;
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
  console.log(`  [${key}]`, JSON.stringify(value, null, 2));
}

export function contract(): Address {
  const c = state().contract;
  if (!c) throw new Error("No contract yet: run npm run deploy");
  return c;
}

/** Run an action we expect might be rejected; record whether it went through and the exact response. */
export async function attempt(key: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    record(key, { ok: true, result });
    return { ok: true as const, result };
  } catch (e) {
    const error = e instanceof ApiRequestError ? { message: e.message, response: e.response } : String(e);
    record(key, { ok: false, error });
    return { ok: false as const, error };
  }
}

export async function waitFor<T>(label: string, fn: () => Promise<T | undefined | false>, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  console.log(`  timed out after ${timeoutMs / 1000}s waiting for: ${label}`);
  return undefined;
}

// ---------- HyperCore reads ----------

export async function perp(name: string) {
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const index = meta.universe.findIndex((u) => u.name === name);
  if (index < 0) throw new Error(`perp ${name} not found`);
  const u = meta.universe[index]!;
  return { index, name, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage, mark: Number(ctxs[index]!.markPx) };
}

export const px = (price: number, szDecimals: number, type: "perp" | "spot" = "perp") =>
  formatPrice(price, szDecimals, type);
export const sz = (size: number, szDecimals: number) => formatSize(size, szDecimals);

/** Snapshot of an account on HyperCore: perp margin, spot balances, open orders incl. triggers. */
export async function snapshot(user: Address) {
  const [ch, spot, orders, role] = await Promise.all([
    info.clearinghouseState({ user }),
    info.spotClearinghouseState({ user }),
    info.frontendOpenOrders({ user }),
    info.userRole({ user }),
  ]);
  return {
    role,
    perpAccountValue: ch.marginSummary.accountValue,
    withdrawable: ch.withdrawable,
    positions: ch.assetPositions.map((p) => ({ coin: p.position.coin, szi: p.position.szi, entryPx: p.position.entryPx })),
    spot: spot.balances.filter((b) => Number(b.total) !== 0).map((b) => ({ coin: b.coin, total: b.total })),
    openOrders: orders.map((o) => ({
      oid: o.oid,
      coin: o.coin,
      side: o.side,
      sz: o.sz,
      origSz: o.origSz,
      limitPx: o.limitPx,
      orderType: o.orderType,
      isTrigger: o.isTrigger,
      triggerPx: o.triggerPx,
      reduceOnly: o.reduceOnly,
      isPositionTpsl: o.isPositionTpsl,
      children: o.children?.length ?? 0,
    })),
  };
}

// ---------- CoreWriter encoding (version 1, 3-byte action id, ABI params) ----------

export function coreAction(actionId: number, types: { type: string }[], values: unknown[]): Hex {
  return encodePacked(["uint8", "uint24", "bytes"], [1, actionId, encodeAbiParameters(types, values)]);
}

export const SPIKE_ABI = [
  { type: "function", name: "addApiWallet", stateMutability: "nonpayable", inputs: [{ name: "agentWallet", type: "address" }, { name: "name", type: "string" }], outputs: [] },
  { type: "function", name: "sendRawAction", stateMutability: "nonpayable", inputs: [{ name: "data", type: "bytes" }], outputs: [] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

/** Owner sends a CoreWriter action from the contract and waits for the EVM receipt. HyperCore applies it a few seconds later, silently. */
export async function viaCoreWriter(label: string, data: Hex) {
  const hash = await ownerEvm().writeContract({ address: contract(), abi: SPIKE_ABI, functionName: "sendRawAction", args: [data] });
  const receipt = await evm.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: EVM tx ${hash} (${receipt.status})`);
  return { hash, status: receipt.status };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
