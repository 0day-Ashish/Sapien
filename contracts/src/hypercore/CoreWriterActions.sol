// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CORE_WRITER, ICoreWriter} from "./ICoreWriter.sol";

/// @notice Encodes HyperCore actions for CoreWriter:
/// 1 byte encoding version, 3 bytes big-endian action id, then the ABI-encoded params.
library CoreWriterActions {
    uint8 internal constant ENCODING_VERSION = 1;
    uint24 internal constant SPOT_SEND = 6;
    uint24 internal constant USD_CLASS_TRANSFER = 7;
    uint24 internal constant ADD_API_WALLET = 9;

    function encode(uint24 actionId, bytes memory params) internal pure returns (bytes memory) {
        return abi.encodePacked(ENCODING_VERSION, actionId, params);
    }

    /// @notice Registers an Agent Wallet (Hyperliquid API wallet) for the calling contract's HyperCore account.
    function addApiWallet(address agentWallet, string memory name) internal {
        ICoreWriter(CORE_WRITER).sendRawAction(encode(ADD_API_WALLET, abi.encode(agentWallet, name)));
    }

    /// @notice Moves USDC between the caller's perp and spot balances. `ntl` has 6 decimals (#4).
    function usdClassTransfer(uint64 ntl, bool toPerp) internal {
        ICoreWriter(CORE_WRITER).sendRawAction(encode(USD_CLASS_TRANSFER, abi.encode(ntl, toPerp)));
    }

    /// @notice Sends a spot token. USDC is token 0 and `wei_` has 8 decimals (#4).
    function spotSend(address destination, uint64 token, uint64 wei_) internal {
        ICoreWriter(CORE_WRITER).sendRawAction(encode(SPOT_SEND, abi.encode(destination, token, wei_)));
    }
}
