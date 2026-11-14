// The engine's Agent Wallets: one fresh key per Vault (Hyperliquid ties an agent address to a single account, and
// the docs advise never reusing one). The UI asks for an address before createVault; the engine keeps the key and
// is the only signer, so Builders and users never hold a Vault's trading key. The key can trade, never withdraw (#4).
//
// Hackathon-grade custody: keys sit in a 0600 JSON file next to the engine. The TEE (stretch) is where they'd move.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

type Entry = { address: string; privateKey: Hex; createdAt: number; vaultId?: string };

export class AgentWalletStore {
  private entries: Entry[];

  constructor(private file: string) {
    this.entries = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Entry[]) : [];
  }

  /** Generates and stores a new Agent Wallet; returns only its address. */
  create(): string {
    const privateKey = generatePrivateKey();
    const { address } = privateKeyToAccount(privateKey);
    this.entries.push({ address, privateKey, createdAt: Date.now() });
    this.save();
    return address;
  }

  /** The signer for an Agent Wallet the engine created. */
  account(address: string): PrivateKeyAccount {
    const entry = this.entries.find((e) => e.address.toLowerCase() === address.toLowerCase());
    if (!entry) throw new Error(`Unknown Agent Wallet ${address}: the engine didn't create it, so it can't sign for it`);
    return privateKeyToAccount(entry.privateKey);
  }

  /**
   * Records which Vault an Agent Wallet trades for, once its VaultCreated / first deposit is seen
   * (VaultCreated carries the agentWallet; Vault.agentWallet() reads it back). One Vault per wallet.
   */
  bind(vaultId: string, agentAddress: string) {
    const entry = this.entries.find((e) => e.address.toLowerCase() === agentAddress.toLowerCase());
    if (!entry) throw new Error(`Unknown Agent Wallet ${agentAddress}`);
    if (entry.vaultId && entry.vaultId.toLowerCase() !== vaultId.toLowerCase()) {
      throw new Error(`Agent Wallet ${agentAddress} already trades for ${entry.vaultId}`);
    }
    entry.vaultId = vaultId;
    this.save();
  }

  /** The signer for a Vault: what HyperliquidExchange's `agentFor` needs. */
  forVault(vaultId: string): PrivateKeyAccount {
    const entry = this.entries.find((e) => e.vaultId?.toLowerCase() === vaultId.toLowerCase());
    if (!entry) throw new Error(`No Agent Wallet bound to Vault ${vaultId}`);
    return privateKeyToAccount(entry.privateKey);
  }

  /** Addresses only, never keys. */
  list() {
    return this.entries.map(({ address, createdAt, vaultId }) => ({ address, createdAt, ...(vaultId ? { vaultId } : {}) }));
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
    chmodSync(this.file, 0o600);
  }
}
