// NEAR adapter: the Sapien Contract (near/README.md) behind a port, so the services and their tests never touch the
// network. Reads are views (anyone). Writes are signed by the engine's Function-Call Key, which the contract limits to
// register_vault, pay_withdraw, log_decision and pay_agent. Amounts are USDC subunits (6 decimals), bigint here.

import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, type KeyPairString, type Provider } from "near-api-js";

export type NearConfig = { deposits: number; withdrawals: number; decisions: number; owner: string; engine: string; usdc: string };
/** `evmVault` is the HyperEVM Vault address the deposit is for. */
export type NearDeposit = { account: string; evmVault: string; amount: bigint; blockTimestampMs: number };
export type WithdrawalStatus = "Requested" | "Paying" | "Paid";
export type NearWithdrawal = { account: string; requested: bigint; paid: bigint; status: WithdrawalStatus };
export type NearVault = { evmVault: string; mandateHash: string | null; killed: boolean; deposited: bigint; withdrawn: bigint };

export interface NearPort {
  config(): Promise<NearConfig>;
  deposit(id: number): Promise<NearDeposit | null>;
  withdrawal(id: number): Promise<NearWithdrawal | null>;
  vaultOf(account: string): Promise<NearVault | null>;
  /** `[agentId, payout account]` for each Specialist Agent registered on NEAR. */
  agents(): Promise<[string, string][]>;
  registerVault(account: string, evmVault: string): Promise<void>;
  /** Pays the user `amount` from the contract's USDC pool. False if the token transfer failed (reverts to Requested). */
  payWithdraw(id: number, amount: bigint): Promise<boolean>;
  logDecision(account: string, agentId: string, hash: string): Promise<void>;
  payAgent(agentId: string, amount: bigint, memo: string): Promise<void>;
}

export type NearContractConfig = {
  /** Tried in order; the first that answers wins. */
  rpcUrls?: string[];
  contract?: string;
  engineAccount?: string;
  /** The Function-Call Key's secret, `ed25519:…`. Without it the adapter is read-only. */
  privateKey?: string;
};

export const DEFAULT_NEAR_RPCS = ["https://rpc.testnet.near.org", "https://test.rpc.fastnear.com"];
const TGAS = 1_000_000_000_000n;

/** Reads the NEAR_* variables (.env.example). Only the key is optional. */
export function nearConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NearContractConfig {
  return {
    rpcUrls: [env.NEAR_RPC_URL, ...DEFAULT_NEAR_RPCS].filter((u): u is string => !!u).filter((u, i, a) => a.indexOf(u) === i),
    contract: env.NEAR_CONTRACT ?? "sapien-vault.testnet",
    engineAccount: env.NEAR_ENGINE_ACCOUNT ?? "engine.sapien-vault.testnet",
    ...(env.NEAR_ENGINE_PRIVATE_KEY ? { privateKey: env.NEAR_ENGINE_PRIVATE_KEY } : {}),
  };
}

const big = (v: unknown) => BigInt(String(v));

export class NearContract implements NearPort {
  private provider: Provider;
  private account?: Account;
  readonly contract: string;

  constructor(c: NearContractConfig = {}) {
    this.contract = c.contract ?? "sapien-vault.testnet";
    const providers = (c.rpcUrls ?? DEFAULT_NEAR_RPCS).map((url) => new JsonRpcProvider({ url }));
    this.provider = providers.length === 1 ? providers[0]! : new FailoverRpcProvider(providers);
    if (c.privateKey) {
      this.account = new Account(c.engineAccount ?? "engine.sapien-vault.testnet", this.provider, KeyPairSigner.fromSecretKey(c.privateKey as KeyPairString));
    }
  }

  get canSign() {
    return !!this.account;
  }

  private async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.provider.callFunction({ contractId: this.contract, method, args })) as T;
  }

  /** Writes go one at a time: one access key means one nonce sequence, and parallel transactions would collide. */
  private queue: Promise<unknown> = Promise.resolve();

  private call(method: string, args: Record<string, unknown>, tgas: bigint): Promise<unknown> {
    const account = this.account;
    if (!account) return Promise.reject(new Error("NEAR_ENGINE_PRIVATE_KEY isn't set: the NEAR adapter is read-only"));
    const run = this.queue.then(() => account.callFunction({ contractId: this.contract, methodName: method, args, gas: tgas * TGAS }));
    this.queue = run.catch(() => {});
    return run;
  }

  async config(): Promise<NearConfig> {
    const c = await this.view<{ deposits: number | string; withdrawals: number | string; decisions: number | string; owner: string; engine: string; usdc: string }>("config");
    return { ...c, deposits: Number(c.deposits), withdrawals: Number(c.withdrawals), decisions: Number(c.decisions) };
  }

  async deposit(id: number) {
    const d = await this.view<{ account: string; evm_vault: string; amount: string; block_timestamp_ms: number | string } | null>("deposit", { id });
    return d ? { account: d.account, evmVault: d.evm_vault, amount: big(d.amount), blockTimestampMs: Number(d.block_timestamp_ms) } : null;
  }

  async withdrawal(id: number) {
    const w = await this.view<{ account: string; requested: string; paid: string; status: WithdrawalStatus } | null>("withdrawal", { id });
    return w ? { account: w.account, requested: big(w.requested), paid: big(w.paid), status: w.status } : null;
  }

  async vaultOf(account: string) {
    const v = await this.view<{ evm_vault: string; mandate_hash: string | null; killed: boolean; deposited: string; withdrawn: string } | null>("vault_of", { account });
    return v ? { evmVault: v.evm_vault, mandateHash: v.mandate_hash ?? null, killed: v.killed, deposited: big(v.deposited), withdrawn: big(v.withdrawn) } : null;
  }

  async agents() {
    return (await this.view<[string, string][] | null>("agents")) ?? [];
  }

  async registerVault(account: string, evmVault: string) {
    await this.call("register_vault", { account, evm_vault: evmVault }, 30n);
  }

  async payWithdraw(id: number, amount: bigint) {
    // The outcome is the contract's callback: true once the USDC transfer succeeded.
    return (await this.call("pay_withdraw", { id, amount: amount.toString() }, 80n)) === true;
  }

  async logDecision(account: string, agentId: string, hash: string) {
    await this.call("log_decision", { account, agent_id: agentId, hash: hash.replace(/^0x/, "") }, 30n);
  }

  async payAgent(agentId: string, amount: bigint, memo: string) {
    await this.call("pay_agent", { agent_id: agentId, amount: amount.toString(), memo }, 80n);
  }
}
