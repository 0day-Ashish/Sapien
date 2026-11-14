// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CoreWriterActions} from "../hypercore/CoreWriterActions.sol";

/// @notice One user's Vault: its own HyperEVM contract and therefore its own HyperCore account (ADR-0004).
/// Funds leave only through the owner's withdrawal path (#7). The Agent Wallet can trade but not withdraw.
contract Vault {
    string internal constant AGENT_WALLET_NAME = "engine";

    address public immutable owner;
    /// @notice Execution Engine operator: registers the Agent Wallet and reports Flat.
    address public immutable engine;
    address public agentWallet;
    /// @notice Whether the Vault has no open positions, as reported by the Execution Engine.
    bool public isFlat = true;

    event AgentWalletRegistered(address indexed agentWallet);
    event FlatReported(bool isFlat);

    error NotEngine();

    modifier onlyEngine() {
        _onlyEngine();
        _;
    }

    constructor(address owner_, address engine_, address agentWallet_) {
        owner = owner_;
        engine = engine_;
        _registerAgentWallet(agentWallet_);
    }

    /// @notice Re-sends the Agent Wallet registration, e.g. once the HyperCore account is activated
    /// (CoreWriter drops actions silently), or rotates it.
    function registerAgentWallet(address agentWallet_) external onlyEngine {
        _registerAgentWallet(agentWallet_);
    }

    function reportFlat(bool isFlat_) external onlyEngine {
        isFlat = isFlat_;
        emit FlatReported(isFlat_);
    }

    function _onlyEngine() internal view {
        if (msg.sender != engine) revert NotEngine();
    }

    function _registerAgentWallet(address agentWallet_) internal {
        agentWallet = agentWallet_;
        CoreWriterActions.addApiWallet(agentWallet_, AGENT_WALLET_NAME);
        emit AgentWalletRegistered(agentWallet_);
    }
}
