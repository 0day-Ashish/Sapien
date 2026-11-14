// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Hook data for Hyperliquid's CctpForwarder (Circle, "Transfer USDC from Ethereum to HyperCore"):
/// bytes24 magic "cctp-forward" | uint32 version 0 | uint32 dataLength 24 | address recipient | uint32 dex,
/// packed big-endian, 56 bytes. Dex 0 credits the recipient's HyperCore perp balance.
/// A wrong recipient loses funds, so layout is pinned by tests.
library CctpHookData {
    bytes24 internal constant MAGIC = bytes24("cctp-forward");
    uint32 internal constant VERSION = 0;
    uint32 internal constant DATA_LENGTH = 24;
    uint32 internal constant PERP_DEX = 0;
    uint256 internal constant LENGTH = 56;

    error BadHookData();

    function encode(address recipient, uint32 dex) internal pure returns (bytes memory) {
        return abi.encodePacked(MAGIC, VERSION, DATA_LENGTH, recipient, dex);
    }

    function decode(bytes calldata hookData) internal pure returns (address recipient, uint32 dex) {
        if (
            hookData.length != LENGTH || bytes24(hookData[0:24]) != MAGIC || uint32(bytes4(hookData[24:28])) != VERSION
                || uint32(bytes4(hookData[28:32])) != DATA_LENGTH
        ) revert BadHookData();
        recipient = address(bytes20(hookData[32:52]));
        dex = uint32(bytes4(hookData[52:56]));
    }

    /// @notice CCTP's bytes32 form of an EVM address (left-padded).
    function toBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
