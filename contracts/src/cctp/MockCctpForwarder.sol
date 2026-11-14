// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {CctpHookData} from "./CctpHookData.sol";

/// @notice Testnet stand-in for CCTP V2 TokenMessengerV2 + Hyperliquid's CctpForwarder, deployed on the source
/// chain (Base Sepolia). Real testnet CCTP only delivers to HyperCore addresses with mainnet state (ADR-0004), which
/// our Deposit Account lacks. Callers use the real `depositForBurnWithHook` arguments and this contract checks them
/// as the real path would, locks the USDC and emits Circle's exact `DepositForBurn` event. The Execution Engine
/// watches that event and credits the Vault from the Deposit Account's HyperCore balance. Switching to real CCTP
/// only changes the address the UI calls and the engine watches.
contract MockCctpForwarder {
    using CctpHookData for bytes;

    uint32 public constant HYPEREVM_DOMAIN = 19;
    /// @notice Testnet per-recipient cap for CCTP to HyperCore.
    uint256 public constant MAX_DEPOSIT = 1000e6;

    IERC20 public immutable usdc;
    /// @notice HyperEVM CctpForwarder: the only valid mint recipient and destination caller.
    address public immutable cctpForwarder;
    /// @notice The only HyperCore recipient this mock forwards to.
    address public immutable depositAccount;

    uint64 public nonce;

    /// @dev Same signature and indexing as CCTP V2 TokenMessengerV2.
    event DepositForBurn(
        address indexed burnToken,
        uint256 amount,
        address indexed depositor,
        bytes32 mintRecipient,
        uint32 destinationDomain,
        bytes32 destinationTokenMessenger,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 indexed minFinalityThreshold,
        bytes hookData
    );

    error WrongToken();
    error WrongDomain();
    error WrongMintRecipient();
    error WrongDestinationCaller();
    error WrongHookRecipient();
    error BadAmount();

    constructor(IERC20 usdc_, address cctpForwarder_, address depositAccount_) {
        usdc = usdc_;
        cctpForwarder = cctpForwarder_;
        depositAccount = depositAccount_;
    }

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external {
        _validate(amount, destinationDomain, mintRecipient, burnToken, destinationCaller, maxFee, hookData);
        nonce++;
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert BadAmount();
        emit DepositForBurn(
            burnToken,
            amount,
            msg.sender,
            mintRecipient,
            destinationDomain,
            bytes32(0),
            destinationCaller,
            maxFee,
            minFinalityThreshold,
            hookData
        );
    }

    function _validate(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        bytes calldata hookData
    ) internal view {
        if (burnToken != address(usdc)) revert WrongToken();
        if (destinationDomain != HYPEREVM_DOMAIN) revert WrongDomain();
        if (mintRecipient != CctpHookData.toBytes32(cctpForwarder)) revert WrongMintRecipient();
        if (destinationCaller != CctpHookData.toBytes32(cctpForwarder)) revert WrongDestinationCaller();
        if (amount == 0 || amount > MAX_DEPOSIT || maxFee >= amount) revert BadAmount();
        (address recipient, uint32 dex) = hookData.decode();
        if (recipient != depositAccount || dex != CctpHookData.PERP_DEX) revert WrongHookRecipient();
    }
}
