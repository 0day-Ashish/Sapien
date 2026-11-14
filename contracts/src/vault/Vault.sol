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
/// Epoch fees and premiums (#17) leave the same way, driven by the FeeRouter: `collectFees` then `payFees`.
contract Vault {
    string internal constant AGENT_WALLET_NAME = "engine";
    /// @notice Extra USDC moved to spot with each fee collection: HyperCore charges the spotSend fee (~0.0245 USDC)
    /// from the spot balance on top of the amount sent.
    uint64 public constant SPOT_SEND_FEE_BUFFER = 30_000;

    address public immutable owner;
    /// @notice Execution Engine operator: registers the Agent Wallet and reports Flat.
    address public immutable engine;
    /// @notice Collects Epoch fees and premiums (#17).
    address public immutable feeRouter;
    address public agentWallet;
    /// @notice Whether the Vault has no open positions, as reported by the Execution Engine.
    bool public isFlat = true;
    /// @notice Fee USDC on its way to (or sitting at) this contract's HyperEVM address, reserved for the FeeRouter.
    uint256 public feesPending;

    event AgentWalletRegistered(address indexed agentWallet);
    event FlatReported(bool isFlat);
    event WithdrawnToEvm(uint64 amount);
    event BridgedOut(uint256 amount, uint32 destinationDomain, bytes32 recipient, uint256 maxFee);
    event FeesCollected(uint64 amount);
    event FeesPaid(uint256 amount);

    error NotEngine();
    error NotOwner();
    error NotFlat();
    error ZeroRecipient();
    error NotFeeRouter();
    error FeesReserved();
    error TransferFailed();

    modifier onlyEngine() {
        _onlyEngine();
        _;
    }

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    constructor(address owner_, address engine_, address feeRouter_, address agentWallet_) {
        owner = owner_;
        engine = engine_;
        feeRouter = feeRouter_;
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
        if (IERC20(HyperEvmCctp.USDC).balanceOf(address(this)) < amount + feesPending) revert FeesReserved();
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

    /// @notice Moves `amount` USDC of Epoch fees from the HyperCore perp balance to this contract's HyperEVM address,
    /// where `payFees` hands it to the FeeRouter. HyperCore applies it in a later block, or drops it silently if the
    /// perp balance can't cover it (margin in use); the FeeRouter asks again next Epoch. Replaces any earlier request.
    function collectFees(uint64 amount) external {
        if (msg.sender != feeRouter) revert NotFeeRouter();
        feesPending = amount;
        CoreWriterActions.usdClassTransfer(amount + SPOT_SEND_FEE_BUFFER, false);
        CoreWriterActions.spotSend(
            HyperEvmCctp.USDC_SYSTEM_ADDRESS, HyperEvmCctp.USDC_TOKEN, amount * HyperEvmCctp.SPOT_WEI_PER_USDC_UNIT
        );
        emit FeesCollected(amount);
    }

    /// @notice Sends the fee USDC that has landed here (up to what was collected) to the FeeRouter.
    function payFees() external returns (uint256 paid) {
        if (msg.sender != feeRouter) revert NotFeeRouter();
        IERC20 usdc = IERC20(HyperEvmCctp.USDC);
        uint256 balance = usdc.balanceOf(address(this));
        paid = feesPending < balance ? feesPending : balance;
        feesPending -= paid;
        if (paid > 0 && !usdc.transfer(feeRouter, paid)) revert TransferFailed();
        emit FeesPaid(paid);
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
