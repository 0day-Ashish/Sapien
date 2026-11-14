import { isAddress, parseAbi, type Address } from "viem";

// ABIs of Lane A's contracts (contracts/src/vault). Keep in step with them.

export const vaultFactoryAbi = parseAbi([
  "function createVault(address agentWallet) returns (address vault)",
  "function isVault(address vault) view returns (bool)",
  "function engine() view returns (address)",
  "event VaultCreated(address indexed owner, address indexed vault, address agentWallet)",
]);

export const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function engine() view returns (address)",
  "function agentWallet() view returns (address)",
  "function isFlat() view returns (bool)",
]);

export const mandateRegistryAbi = parseAbi([
  "struct MandateVersion { bytes32 mandateHash; uint32 leverageCapE2; uint16 stopLossBps; uint16 drawdownCapBps; uint64 vetoThresholdUsdc; bool killFlag; uint64 signedAt; }",
  "function signMandateVersion(address vault, bytes mandateJson, uint32 leverageCapE2, uint16 stopLossBps, uint16 drawdownCapBps, uint64 vetoThresholdUsdc, bool killFlag, bool scopeNotLoosened) returns (uint256 version)",
  "function activatePending(address vault)",
  "function currentMandate(address vault) view returns (uint256 version, MandateVersion m)",
  "function versionAt(address vault, uint256 version) view returns (MandateVersion)",
  "function versionCount(address vault) view returns (uint256)",
  "function effectiveVersion(address vault) view returns (uint256)",
  "function pendingVersion(address vault) view returns (uint256)",
  "event MandateVersionSigned(address indexed vault, uint256 indexed version, bytes32 mandateHash, bytes mandateJson)",
  "event MandateVersionEffective(address indexed vault, uint256 indexed version)",
  "error NotVaultOwner()",
  "error NoPendingVersion()",
  "error VaultNotFlat()",
]);

const address = (value: string | undefined): Address | undefined =>
  value && isAddress(value) ? value : undefined;

// NEXT_PUBLIC_* values are inlined at build time, so each must be read by its full name.
export const deployment = {
  vaultFactory: address(process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS),
  mandateRegistry: address(process.env.NEXT_PUBLIC_MANDATE_REGISTRY_ADDRESS),
  /** Placeholder until the Execution Engine hands out an Agent Wallet per Vault. */
  agentWallet: address(process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS),
};

export const missingDeploymentConfig = () =>
  [
    !deployment.vaultFactory && "NEXT_PUBLIC_VAULT_FACTORY_ADDRESS",
    !deployment.mandateRegistry && "NEXT_PUBLIC_MANDATE_REGISTRY_ADDRESS",
    !deployment.agentWallet && "NEXT_PUBLIC_AGENT_WALLET_ADDRESS",
  ].filter((name): name is string => Boolean(name));
