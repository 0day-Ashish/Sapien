// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice HyperEVM CoreWriter system contract. Sends actions to HyperCore.
/// It returns no success or failure, and actions land with a few seconds' delay.
interface ICoreWriter {
    event RawAction(address indexed user, bytes data);

    function sendRawAction(bytes calldata data) external;
}

address constant CORE_WRITER = 0x3333333333333333333333333333333333333333;
