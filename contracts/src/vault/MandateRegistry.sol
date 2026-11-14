// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vault} from "./Vault.sol";

/// @notice Stores each Vault's signed Mandate Versions (ADR-0003: enforced in the engine, provable onchain).
/// The full Mandate (assets, blackout windows, ...) is JSON, emitted in `MandateVersionSigned` and committed
/// by its hash. The numeric caps are also stored so tightness can be judged onchain. The engine rejects a
/// version whose fields disagree with its JSON.
/// A tighter version is effective immediately; a looser one stays pending until the Vault is Flat.
contract MandateRegistry {
    struct MandateVersion {
        bytes32 mandateHash; // keccak256 of the Mandate JSON
        uint32 leverageCapE2; // leverage cap x100 (3x = 300)
        uint16 stopLossBps;
        uint16 drawdownCapBps;
        uint64 vetoThresholdUsdc; // 6 decimals
        bool killFlag;
        uint64 signedAt;
    }

    mapping(address vault => MandateVersion[]) internal _versions;
    /// @notice 1-based index of the effective version (0 = none yet).
    mapping(address vault => uint256) public effectiveVersion;
    /// @notice 1-based index of a looser version waiting for the Vault to be Flat (0 = none).
    mapping(address vault => uint256) public pendingVersion;

    event MandateVersionSigned(address indexed vault, uint256 indexed version, bytes32 mandateHash, bytes mandateJson);
    event MandateVersionEffective(address indexed vault, uint256 indexed version);

    error NotVaultOwner();
    error NoPendingVersion();
    error VaultNotFlat();

    /// @param scopeNotLoosened The signer's claim that allowed assets and blackout windows are not looser
    /// than the effective version's. Only the JSON holds them, so the engine verifies the claim.
    function signMandateVersion(
        Vault vault,
        bytes calldata mandateJson,
        uint32 leverageCapE2,
        uint16 stopLossBps,
        uint16 drawdownCapBps,
        uint64 vetoThresholdUsdc,
        bool killFlag,
        bool scopeNotLoosened
    ) external returns (uint256 version) {
        if (msg.sender != vault.owner()) revert NotVaultOwner();
        address v = address(vault);

        MandateVersion memory m = MandateVersion({
            mandateHash: keccak256(mandateJson),
            leverageCapE2: leverageCapE2,
            stopLossBps: stopLossBps,
            drawdownCapBps: drawdownCapBps,
            vetoThresholdUsdc: vetoThresholdUsdc,
            killFlag: killFlag,
            signedAt: uint64(block.timestamp)
        });
        _versions[v].push(m);
        version = _versions[v].length;
        emit MandateVersionSigned(v, version, m.mandateHash, mandateJson);

        uint256 current = effectiveVersion[v];
        bool immediate =
            current == 0 || vault.isFlat() || (scopeNotLoosened && _notLooser(m, _versions[v][current - 1]));
        if (immediate) {
            delete pendingVersion[v];
            _makeEffective(v, version);
        } else {
            pendingVersion[v] = version; // supersedes any earlier pending version
        }
    }

    /// @notice Makes the pending looser version effective once the Vault is Flat. Anyone may call.
    function activatePending(Vault vault) external {
        address v = address(vault);
        uint256 pending = pendingVersion[v];
        if (pending == 0) revert NoPendingVersion();
        if (!vault.isFlat()) revert VaultNotFlat();
        delete pendingVersion[v];
        _makeEffective(v, pending);
    }

    function currentMandate(address vault) external view returns (uint256 version, MandateVersion memory m) {
        version = effectiveVersion[vault];
        if (version != 0) m = _versions[vault][version - 1];
    }

    function versionAt(address vault, uint256 version) external view returns (MandateVersion memory) {
        return _versions[vault][version - 1];
    }

    function versionCount(address vault) external view returns (uint256) {
        return _versions[vault].length;
    }

    function _makeEffective(address v, uint256 version) internal {
        effectiveVersion[v] = version;
        emit MandateVersionEffective(v, version);
    }

    function _notLooser(MandateVersion memory n, MandateVersion memory c) internal pure returns (bool) {
        return n.leverageCapE2 <= c.leverageCapE2 && n.stopLossBps <= c.stopLossBps
            && n.drawdownCapBps <= c.drawdownCapBps && n.vetoThresholdUsdc <= c.vetoThresholdUsdc
            && (n.killFlag || !c.killFlag);
    }
}
