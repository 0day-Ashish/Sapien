// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vault} from "./Vault.sol";

/// @notice Creates Vaults. The caller becomes the owner; the Agent Wallet comes from the Execution Engine.
contract VaultFactory {
    address public immutable engine;
    /// @notice Collects every Vault's Epoch fees and premiums (#17).
    address public immutable feeRouter;
    mapping(address vault => bool) public isVault;
    /// @notice The Vault an owner's deposits are credited to. CCTP deposits all land in the Deposit Account
    /// (ADR-0004); the engine matches each to a Vault by depositor through this. Set on createVault.
    mapping(address owner => address vault) public depositTargetOf;

    event VaultCreated(address indexed owner, address indexed vault, address agentWallet);
    event DepositTargetSet(address indexed owner, address indexed vault);

    error NotVaultOwner();

    constructor(address engine_, address feeRouter_) {
        engine = engine_;
        feeRouter = feeRouter_;
    }

    function createVault(address agentWallet) external returns (Vault vault) {
        vault = new Vault(msg.sender, engine, feeRouter, agentWallet);
        isVault[address(vault)] = true;
        emit VaultCreated(msg.sender, address(vault), agentWallet);
        _setDepositTarget(address(vault));
    }

    function setDepositTarget(address vault) external {
        if (!isVault[vault] || Vault(vault).owner() != msg.sender) revert NotVaultOwner();
        _setDepositTarget(vault);
    }

    function _setDepositTarget(address vault) internal {
        depositTargetOf[msg.sender] = vault;
        emit DepositTargetSet(msg.sender, vault);
    }
}
