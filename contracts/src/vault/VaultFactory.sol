// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vault} from "./Vault.sol";

/// @notice Creates Vaults. The caller becomes the owner; the Agent Wallet comes from the Execution Engine.
contract VaultFactory {
    address public immutable engine;
    mapping(address vault => bool) public isVault;

    event VaultCreated(address indexed owner, address indexed vault, address agentWallet);

    constructor(address engine_) {
        engine = engine_;
    }

    function createVault(address agentWallet) external returns (Vault vault) {
        vault = new Vault(msg.sender, engine, agentWallet);
        isVault[address(vault)] = true;
        emit VaultCreated(msg.sender, address(vault), agentWallet);
    }
}
