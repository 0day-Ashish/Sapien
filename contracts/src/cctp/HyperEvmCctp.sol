// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice CCTP V2 on HyperEVM testnet (Circle contract and USDC address references) and the HyperCore USDC bridge.
library HyperEvmCctp {
    address internal constant TOKEN_MESSENGER_V2 = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address internal constant USDC = 0x2B3370eE501B4a559b57D449569354196457D8Ab;
    /// @notice HyperCore system address for USDC (token 0): a spot send here credits the sender's HyperEVM address.
    address internal constant USDC_SYSTEM_ADDRESS = 0x2000000000000000000000000000000000000000;
    uint64 internal constant USDC_TOKEN = 0;
    /// @notice HyperCore spot USDC has 8 decimals, EVM USDC 6.
    uint64 internal constant SPOT_WEI_PER_USDC_UNIT = 100;
    uint32 internal constant STANDARD_FINALITY = 2000;
    /// @notice Circle Forwarding Service hook (v0, no payload): Circle mints on the destination, no receiveMessage.
    bytes internal constant FORWARD_HOOK = hex"636374702d666f72776172640000000000000000000000000000000000000000";
}

interface ITokenMessengerV2 {
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external;
}
