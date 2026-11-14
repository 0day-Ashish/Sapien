// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {CoreWriterActions} from "../hypercore/CoreWriterActions.sol";
import {HyperEvmCctp, ITokenMessengerV2} from "../cctp/HyperEvmCctp.sol";

/// @notice One user's Vault: its own HyperEVM contract and therefore its own HyperCore account (ADR-0004).
/// Funds leave only through the owner's withdrawal path (#7). The Agent Wallet can trade but not withdraw (#4).
/// Withdrawal is two steps, because HyperCore credits HyperEVM in a later block:
/// 1. `withdrawToEvm`: perp -> spot -> the USDC system address, landing as ERC20 USDC at this contract (Flat only).
/// 2. `bridgeOut`: CCTP V2 burn with Circle's forwarding hook, minted to the owner's recipient on the destination.
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
    event WithdrawnToEvm(uint64 amount);
    event BridgedOut(uint256 amount, uint32 destinationDomain, bytes32 recipient, uint256 maxFee);

    error NotEngine();
    error NotOwner();
    error NotFlat();
    error ZeroRecipient();

    modifier onlyEngine() {
        _onlyEngine();
        _;
    }

    modifier onlyOwner() {
        _onlyOwner();
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

    /// @notice Step 1: moves `amount` USDC (6 decimals) from this Vault's HyperCore perp balance to its HyperEVM
    /// address. Owner only, and only while Flat, so no open position loses its margin.
    function withdrawToEvm(uint64 amount) external onlyOwner {
        if (!isFlat) revert NotFlat();
        CoreWriterActions.usdClassTransfer(amount, false);
        CoreWriterActions.spotSend(
            HyperEvmCctp.USDC_SYSTEM_ADDRESS, HyperEvmCctp.USDC_TOKEN, amount * HyperEvmCctp.SPOT_WEI_PER_USDC_UNIT
        );
        emit WithdrawnToEvm(amount);
    }

    /// @notice Step 2: burns `amount` HyperEVM USDC via CCTP V2 with forwarding, minted to `recipient` on
    /// `destinationDomain` (Base Sepolia = 6). The recipient gets `amount - fee`, fee <= `maxFee`.
    function bridgeOut(uint256 amount, uint32 destinationDomain, bytes32 recipient, uint256 maxFee) external onlyOwner {
        if (recipient == bytes32(0)) revert ZeroRecipient();
        IERC20(HyperEvmCctp.USDC).approve(HyperEvmCctp.TOKEN_MESSENGER_V2, amount);
        ITokenMessengerV2(HyperEvmCctp.TOKEN_MESSENGER_V2)
            .depositForBurnWithHook(
                amount,
                destinationDomain,
                recipient,
                HyperEvmCctp.USDC,
                bytes32(0),
                maxFee,
                HyperEvmCctp.STANDARD_FINALITY,
                HyperEvmCctp.FORWARD_HOOK
            );
        emit BridgedOut(amount, destinationDomain, recipient, maxFee);
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
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
