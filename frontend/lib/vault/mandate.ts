import { keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import type { Mandate } from "../mandate/schema";

// Create a Vault and sign its Mandate onchain (ticket #5). Contracts: contracts/src/vault/VaultFactory.sol and
// MandateRegistry.sol; addresses in contracts/deployments/hyperevm-testnet.json (NEXT_PUBLIC_* overrides them).
// The engine (engine/src/adapters/hyperevm.ts) reads the JSON back from the MandateVersionSigned event and rejects a
// version whose caps disagree with it, so the caps here are derived from the same numbers, rounded the same way.

export const MANDATE_REGISTRY = (process.env.NEXT_PUBLIC_MANDATE_REGISTRY_ADDRESS ||
  "0xC08aA5bc113B8CC4Acd5006c9a9B8419Fab4475E") as Address;

export const createVaultAbi = parseAbi([
  "function createVault(address agentWallet) returns (address)",
  "event VaultCreated(address indexed owner, address indexed vault, address agentWallet)",
]);

export const mandateRegistryAbi = parseAbi([
  "struct MandateVersion { bytes32 mandateHash; uint32 leverageCapE2; uint16 stopLossBps; uint16 drawdownCapBps; uint64 vetoThresholdUsdc; bool killFlag; uint64 signedAt; }",
  "function signMandateVersion(address vault, bytes mandateJson, uint32 leverageCapE2, uint16 stopLossBps, uint16 drawdownCapBps, uint64 vetoThresholdUsdc, bool killFlag, bool scopeNotLoosened) returns (uint256)",
  "function versionCount(address vault) view returns (uint256)",
  "function versionAt(address vault, uint256 version) view returns (MandateVersion)",
  "function effectiveVersion(address vault) view returns (uint256)",
  "function pendingVersion(address vault) view returns (uint256)",
  "function activatePending(address vault)",
]);

export type MandateVersion = {
  mandateHash: Hex;
  leverageCapE2: number;
  stopLossBps: number;
  drawdownCapBps: number;
  vetoThresholdUsdc: bigint;
  killFlag: boolean;
  signedAt: bigint;
};

/** The Mandate as signed: fixed field order, so the same Mandate always hashes the same. */
export function mandateJson(m: Mandate): string {
  return JSON.stringify({
    allowedAssets: m.allowedAssets,
    leverageCap: m.leverageCap,
    stopLossPct: m.stopLossPct,
    drawdownCapPct: m.drawdownCapPct,
    vetoThresholdUsdc: m.vetoThresholdUsdc,
    blackoutWindows: m.blackoutWindows.map((w) => ({ event: w.event, start: w.start, end: w.end })),
  });
}

export const mandateHash = (m: Mandate): Hex => keccak256(toHex(mandateJson(m)));

/**
 * `signMandateVersion` arguments. The kill flag is never set here (only the Kill Switch sets it), and the scope is
 * not claimed tighter: a version that changes assets or blackout windows waits until the Vault is Flat, unless it's
 * the first one.
 */
export function signMandateArgs(vault: Address, m: Mandate) {
  return [
    vault,
    toHex(mandateJson(m)),
    Math.round(m.leverageCap * 100),
    Math.round(m.stopLossPct * 100),
    Math.round(m.drawdownCapPct * 100),
    BigInt(Math.round(m.vetoThresholdUsdc * 1e6)),
    false,
    false,
  ] as const;
}

export type VersionStatus = "effective" | "pending" | "superseded";

/** Each signed version (1-based, newest first) with whether it's in force, waiting for Flat, or replaced. */
export function versionHistory(versions: MandateVersion[], effective: number, pending: number) {
  return versions
    .map((v, i) => {
      const version = i + 1;
      const status: VersionStatus = version === effective ? "effective" : version === pending ? "pending" : "superseded";
      return { version, status, ...v };
    })
    .reverse();
}

/** A stored cap back as the number the user signed: 300 -> "3x", 250 bps -> "2.5%". */
export const formatLeverage = (e2: number) => `${e2 / 100}x`;
export const formatBps = (bps: number) => `${bps / 100}%`;
