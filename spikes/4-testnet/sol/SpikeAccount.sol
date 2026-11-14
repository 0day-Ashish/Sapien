// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CORE_WRITER, ICoreWriter} from "hypercore/ICoreWriter.sol";
import {CoreWriterActions} from "hypercore/CoreWriterActions.sol";

/// @notice Throwaway contract for the #4 testnet spike. It has no private key, so its HyperCore
/// account can only act through CoreWriter (owner-only here) or through an Agent Wallet it registers.
contract SpikeAccount {
    address public immutable owner;

    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Action 9 through the shared encoder in contracts/, so the spike also checks that encoding on a real chain.
    function addApiWallet(address agentWallet, string calldata name) external onlyOwner {
        CoreWriterActions.addApiWallet(agentWallet, name);
    }

    /// @notice Any other CoreWriter action, already encoded (version byte, 3-byte action id, ABI params).
    function sendRawAction(bytes calldata data) external onlyOwner {
        ICoreWriter(CORE_WRITER).sendRawAction(data);
    }
}
