// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {CctpHookData} from "../src/cctp/CctpHookData.sol";
import {MockCctpForwarder} from "../src/cctp/MockCctpForwarder.sol";
import {TestUsdc} from "./stubs/TestUsdc.sol";

/// @dev Exposes the internal library so calldata decoding can be tested.
contract HookDataHarness {
    function encode(address r, uint32 dex) external pure returns (bytes memory) {
        return CctpHookData.encode(r, dex);
    }

    function decode(bytes calldata h) external pure returns (address, uint32) {
        return CctpHookData.decode(h);
    }
}

contract MockCctpForwarderTest is Test {
    // Real addresses (Circle docs): HyperEVM testnet CctpForwarder; our Deposit Account (#3).
    address constant FORWARDER = 0x02e39ECb8368b41bF68FF99ff351aC9864e5E2a2;
    address constant DEPOSIT_ACCOUNT = 0x32c0bce52F64b99ACAe8Bfb6BB91F8ACcce28036;
    bytes32 constant FORWARDER_B32 = 0x00000000000000000000000002e39ecb8368b41bf68ff99ff351ac9864e5e2a2;
    /// @dev Golden bytes, worked by hand from Circle's layout: "cctp-forward" padded to 24 | v0 | len 24 | addr | dex 0.
    bytes constant GOLDEN_HOOK = hex"636374702d666f72776172640000000000000000000000000000000000000018"
        hex"32c0bce52f64b99acae8bfb6bb91f8accce28036" hex"00000000";

    HookDataHarness h = new HookDataHarness();
    TestUsdc usdc;
    MockCctpForwarder mock;
    address user = makeAddr("user");

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

    function setUp() public {
        usdc = new TestUsdc();
        mock = new MockCctpForwarder(IERC20(address(usdc)), FORWARDER, DEPOSIT_ACCOUNT);
        usdc.mint(user, 2000e6);
        vm.prank(user);
        usdc.approve(address(mock), type(uint256).max);
    }

    function _deposit(uint256 amount, bytes32 recipient, bytes32 caller, bytes memory hook) internal {
        vm.prank(user);
        mock.depositForBurnWithHook(amount, 19, recipient, address(usdc), caller, 250_000, 1000, hook);
    }

    // --- encoding (wrong bytes = permanent loss on the real path) ---

    function test_hookData_matchesGoldenBytes() public view {
        bytes memory hook = h.encode(DEPOSIT_ACCOUNT, 0);
        assertEq(hook.length, 56);
        assertEq(hook, GOLDEN_HOOK);
    }

    function test_hookData_spotDexIsBigEndianMaxUint32() public view {
        bytes memory hook = h.encode(DEPOSIT_ACCOUNT, type(uint32).max);
        assertEq(uint8(hook[52]), 0xff);
        assertEq(uint8(hook[55]), 0xff);
    }

    function test_hookData_roundTrips() public view {
        (address r, uint32 dex) = h.decode(GOLDEN_HOOK);
        assertEq(r, DEPOSIT_ACCOUNT);
        assertEq(dex, 0);
    }

    function test_hookData_rejectsBadMagicOrLength() public {
        bytes memory bad = bytes.concat(GOLDEN_HOOK);
        bad[0] = "x";
        vm.expectRevert(CctpHookData.BadHookData.selector);
        h.decode(bad);
        vm.expectRevert(CctpHookData.BadHookData.selector);
        h.decode(bytes.concat(GOLDEN_HOOK, hex"00"));
    }

    function test_mintRecipient_isLeftPaddedAddress() public pure {
        assertEq(CctpHookData.toBytes32(FORWARDER), FORWARDER_B32);
    }

    // --- mock forwarder ---

    function test_deposit_locksUsdcAndEmitsCircleEvent() public {
        vm.expectEmit(address(mock));
        emit DepositForBurn(
            address(usdc), 100e6, user, FORWARDER_B32, 19, bytes32(0), FORWARDER_B32, 250_000, 1000, GOLDEN_HOOK
        );
        _deposit(100e6, FORWARDER_B32, FORWARDER_B32, GOLDEN_HOOK);
        assertEq(usdc.balanceOf(address(mock)), 100e6);
        assertEq(mock.nonce(), 1);
    }

    function test_eventSignature_matchesCctpV2() public pure {
        // topic0 of live TokenMessengerV2 DepositForBurn logs on Base Sepolia
        assertEq(DepositForBurn.selector, 0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5);
    }

    function test_rejectsWrongMintRecipientOrCaller() public {
        bytes32 wrong = CctpHookData.toBytes32(DEPOSIT_ACCOUNT);
        vm.expectRevert(MockCctpForwarder.WrongMintRecipient.selector);
        _deposit(100e6, wrong, FORWARDER_B32, GOLDEN_HOOK);
        vm.expectRevert(MockCctpForwarder.WrongDestinationCaller.selector);
        _deposit(100e6, FORWARDER_B32, wrong, GOLDEN_HOOK);
    }

    function test_rejectsHookToOtherRecipient() public {
        bytes memory hookToUser = h.encode(user, 0);
        vm.expectRevert(MockCctpForwarder.WrongHookRecipient.selector);
        _deposit(100e6, FORWARDER_B32, FORWARDER_B32, hookToUser);
    }

    function test_rejectsAboveTestnetCap() public {
        vm.expectRevert(MockCctpForwarder.BadAmount.selector);
        _deposit(1000e6 + 1, FORWARDER_B32, FORWARDER_B32, GOLDEN_HOOK);
    }

    function test_rejectsWrongDomainOrToken() public {
        vm.startPrank(user);
        vm.expectRevert(MockCctpForwarder.WrongDomain.selector);
        mock.depositForBurnWithHook(100e6, 6, FORWARDER_B32, address(usdc), FORWARDER_B32, 0, 1000, GOLDEN_HOOK);
        vm.expectRevert(MockCctpForwarder.WrongToken.selector);
        mock.depositForBurnWithHook(100e6, 19, FORWARDER_B32, user, FORWARDER_B32, 0, 1000, GOLDEN_HOOK);
        vm.stopPrank();
    }
}
