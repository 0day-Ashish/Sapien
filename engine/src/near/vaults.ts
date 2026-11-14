// Vault binding for NEAR accounts. A user's NEAR account owns a Vault through the Sapien Contract, but the Vault
// itself lives on HyperEVM, so the engine creates it on the user's behalf and binds the two with `register_vault`.
//
// Testnet custody: the engine operator becomes the Vault's EVM owner (VaultFactory.createVault makes msg.sender the
// owner). The user never holds an EVM key; their authority is the NEAR side (Mandate hash, Kill Switch, withdrawals),
// which the engine honours. Mainnet would hand EVM ownership to a contract or TEE that obeys the NEAR contract only.

import { createHash } from "node:crypto";
import type { Address } from "viem";
import type { NearPort } from "../adapters/near.js";
import type { StateStore } from "./state.js";

export type VaultBinding = { account: string; evmVault: Address; agentWallet: Address };

export class BindingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The numeric caps MandateRegistry stores next to the JSON, rounded as the frontend and the engine's reader do. */
export type MandateCaps = { leverageCapE2: number; stopLossBps: number; drawdownCapBps: number; vetoThresholdUsdc: bigint };

export interface VaultEvmPorts {
  /** VaultFactory.createVault(agentWallet), signed by the engine operator (the Vault's EVM owner); returns the new Vault. */
  createVault(agentWallet: Address): Promise<Address>;
  /** Vault.agentWallet(). */
  agentWalletOf(vault: Address): Promise<Address>;
  /** MandateRegistry.signMandateVersion for the Vault, signed by its owner (the engine operator); returns the tx hash. */
  publishMandate(vault: Address, mandateJson: string, caps: MandateCaps): Promise<string>;
}

export interface AgentWalletMaker {
  create(): string;
  bind(vaultId: string, agentAddress: string): void;
}

/** Account ↔ Vault ↔ Agent Wallet, kept so a half-finished binding resumes and the engine can map a Vault back to its NEAR account. */
export class NearVaultStore {
  constructor(private state: StateStore<Record<string, VaultBinding>>) {}
  get(account: string): VaultBinding | undefined {
    return this.state.load()[account];
  }
  byVault(vault: string): VaultBinding | undefined {
    return Object.values(this.state.load()).find((b) => b.evmVault.toLowerCase() === vault.toLowerCase());
  }
  set(binding: VaultBinding) {
    this.state.save({ ...this.state.load(), [binding.account]: binding });
  }
}

const ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+([._-][a-z0-9]+)*$/;

/** The hash a user commits from their NEAR wallet: sha256 of the Mandate's JSON text, as hex. */
export const mandateHash = (mandate: unknown) => createHash("sha256").update(JSON.stringify(mandate), "utf8").digest("hex");

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** The Mandate fields the registry stores; throws BindingError(400) for anything the engine couldn't read back. */
export function mandateCaps(m: unknown): MandateCaps {
  const o = m as Record<string, unknown> | null;
  const ok =
    !!o &&
    typeof o === "object" &&
    Array.isArray(o.allowedAssets) &&
    o.allowedAssets.length > 0 &&
    o.allowedAssets.every((a) => typeof a === "string") &&
    isNum(o.leverageCap) &&
    isNum(o.stopLossPct) &&
    isNum(o.drawdownCapPct) &&
    isNum(o.vetoThresholdUsdc) &&
    (o.blackoutWindows === undefined || (Array.isArray(o.blackoutWindows) && o.blackoutWindows.every((w) => isNum(w?.start) && isNum(w?.end))));
  if (!ok) throw new BindingError(400, "mandate: allowedAssets, leverageCap, stopLossPct, drawdownCapPct, vetoThresholdUsdc (and blackoutWindows {start,end}) are required");
  const x = o as { leverageCap: number; stopLossPct: number; drawdownCapPct: number; vetoThresholdUsdc: number };
  return {
    leverageCapE2: Math.round(x.leverageCap * 100),
    stopLossBps: Math.round(x.stopLossPct * 100),
    drawdownCapBps: Math.round(x.drawdownCapPct * 100),
    vetoThresholdUsdc: BigInt(Math.round(x.vetoThresholdUsdc * 1e6)),
  };
}

export type VaultService = ReturnType<typeof createVaultService>;

export function createVaultService(c: { near: NearPort; evm: VaultEvmPorts; agentWallets: AgentWalletMaker; store: NearVaultStore }) {
  /** One binding per account at a time: two concurrent POSTs must not create two Vaults. */
  const inFlight = new Map<string, Promise<{ binding: VaultBinding; created: boolean }>>();

  const checkAccount = (account: unknown): string => {
    if (typeof account !== "string" || !ACCOUNT.test(account)) throw new BindingError(400, "account must be a NEAR account id");
    return account;
  };

  async function existing(account: string): Promise<VaultBinding | null> {
    const onChain = await c.near.vaultOf(account);
    if (!onChain) return null;
    const evmVault = onChain.evmVault as Address;
    return { account, evmVault, agentWallet: c.store.get(account)?.agentWallet ?? (await c.evm.agentWalletOf(evmVault)) };
  }

  async function create(account: string) {
    const found = await existing(account);
    if (found) return { binding: found, created: false };
    // A crash between createVault and register_vault leaves a stored half binding: resume it instead of making a second Vault.
    let binding = c.store.get(account);
    if (!binding) {
      const agentWallet = c.agentWallets.create() as Address;
      const evmVault = await c.evm.createVault(agentWallet);
      binding = { account, evmVault, agentWallet };
      c.store.set(binding);
    }
    c.agentWallets.bind(binding.evmVault, binding.agentWallet);
    await c.near.registerVault(account, binding.evmVault);
    return { binding, created: true };
  }

  return {
    /** Idempotent: returns the account's Vault, creating and registering it the first time. */
    async bind(accountInput: unknown) {
      const account = checkAccount(accountInput);
      let p = inFlight.get(account);
      if (!p) {
        p = create(account).finally(() => inFlight.delete(account));
        inFlight.set(account, p);
      }
      return p;
    },

    async get(accountInput: unknown): Promise<VaultBinding | null> {
      return existing(checkAccount(accountInput));
    },

    /** Publishes the Mandate the user committed on NEAR to their Vault on HyperEVM. */
    async publishMandate(accountInput: unknown, mandate: unknown): Promise<{ mandateHash: string; txHash: string }> {
      const account = checkAccount(accountInput);
      const caps = mandateCaps(mandate);
      const vault = await c.near.vaultOf(account);
      if (!vault) throw new BindingError(404, `No Vault for ${account}`);
      const hash = mandateHash(mandate);
      if (!vault.mandateHash) throw new BindingError(409, "No Mandate hash committed on NEAR yet: call commit_mandate first");
      if (vault.mandateHash.replace(/^0x/, "").toLowerCase() !== hash) {
        throw new BindingError(409, `Mandate hash ${hash} doesn't match the one committed on NEAR (${vault.mandateHash})`);
      }
      // The exact bytes the user hashed go onchain, so the registry's keccak commits to the same text.
      const txHash = await c.evm.publishMandate(vault.evmVault as Address, JSON.stringify(mandate), caps);
      return { mandateHash: hash, txHash };
    },
  };
}
