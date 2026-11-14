// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/vault/Vault.sol";
import {VaultFactory} from "../src/vault/VaultFactory.sol";
import {HyperEvmCctp} from "../src/cctp/HyperEvmCctp.sol";
import {CoreWriterStub, installCoreWriterStub} from "./stubs/CoreWriterStub.sol";
import {TestUsdc} from "./stubs/TestUsdc.sol";
import {TokenMessengerStub} from "./stubs/TokenMessengerStub.sol";

contract VaultWithdrawTest is Test {
    CoreWriterStub coreWriter;
    TestUsdc usdc;
    TokenMessengerStub messenger;
    Vault vault;

    address engine = makeAddr("engine");
    address feeRouter = makeAddr("feeRouter");
    address user = makeAddr("user");
    bytes32 recipient = bytes32(uint256(uint160(makeAddr("userOnBase"))));

    function setUp() public {
        coreWriter = installCoreWriterStub(vm);
        vm.etch(HyperEvmCctp.USDC, address(new TestUsdc()).code);
        vm.etch(HyperEvmCctp.TOKEN_MESSENGER_V2, address(new TokenMessengerStub()).code);
        usdc = TestUsdc(HyperEvmCctp.USDC);
        messenger = TokenMessengerStub(HyperEvmCctp.TOKEN_MESSENGER_V2);
        VaultFactory factory = new VaultFactory(engine, feeRouter);
        vm.prank(user);
        vault = factory.createVault(makeAddr("agentWallet"));
    }

    // --- step 1: HyperCore -> HyperEVM ---

    function test_withdrawToEvm_writesPerpToSpotThenSpotSendToUsdcSystemAddress() public {
        vm.prank(user);
        vault.withdrawToEvm(12_345_678); // 12.345678 USDC

        assertEq(coreWriter.actionCount(), 3); // 0 = Agent Wallet registration
        (address s1, bytes memory classTransfer) = coreWriter.actionAt(1);
        (address s2, bytes memory spotSend) = coreWriter.actionAt(2);
        assertEq(s1, address(vault));
        assertEq(s2, address(vault));
        assertEq(classTransfer, abi.encodePacked(uint8(1), uint24(7), abi.encode(uint64(12_345_678), false)));
        assertEq(
            spotSend,
            abi.encodePacked(
                uint8(1),
                uint24(6),
                abi.encode(address(0x2000000000000000000000000000000000000000), uint64(0), uint64(1_234_567_800))
            )
        );
    }

    function test_withdrawToEvm_onlyOwner() public {
        vm.prank(engine);
        vm.expectRevert(Vault.NotOwner.selector);
        vault.withdrawToEvm(1e6);
        vm.prank(makeAddr("agentWallet"));
        vm.expectRevert(Vault.NotOwner.selector);
        vault.withdrawToEvm(1e6);
    }

    function test_withdrawToEvm_onlyWhenFlat() public {
        vm.prank(engine);
        vault.reportFlat(false);
        vm.prank(user);
        vm.expectRevert(Vault.NotFlat.selector);
        vault.withdrawToEvm(1e6);
        assertEq(coreWriter.actionCount(), 1);
    }

    // --- step 2: CCTP burn with forwarding ---

    function test_bridgeOut_burnsWithForwardingHookToRecipient() public {
        usdc.mint(address(vault), 10e6);
        vm.prank(user);
        vault.bridgeOut(10e6, 6, recipient, 53_233);

        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(messenger.burnCount(), 1);
        TokenMessengerStub.Burn memory b = messenger.burnAt(0);
        assertEq(b.from, address(vault));
        assertEq(b.amount, 10e6);
        assertEq(b.destinationDomain, 6);
        assertEq(b.mintRecipient, recipient);
        assertEq(b.burnToken, HyperEvmCctp.USDC);
        assertEq(b.destinationCaller, bytes32(0)); // forwarding needs an open destination caller
        assertEq(b.maxFee, 53_233);
        assertEq(b.minFinalityThreshold, 2000);
        assertEq(b.hookData, bytes.concat(bytes24("cctp-forward"), bytes8(0)));
    }

    function test_bridgeOut_onlyOwner_nonZeroRecipient() public {
        usdc.mint(address(vault), 10e6);
        vm.prank(engine);
        vm.expectRevert(Vault.NotOwner.selector);
        vault.bridgeOut(10e6, 6, recipient, 0);
        vm.prank(user);
        vm.expectRevert(Vault.ZeroRecipient.selector);
        vault.bridgeOut(10e6, 6, bytes32(0), 0);
    }
}
