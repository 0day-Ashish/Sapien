// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CoreWriterActions} from "../src/hypercore/CoreWriterActions.sol";
import {CoreWriterStub, installCoreWriterStub} from "./stubs/CoreWriterStub.sol";

/// @dev Minimal caller standing in for a Vault until Lane A's Vault contract lands (#5).
contract AgentWalletRegistrar {
    function register(address agentWallet) external {
        CoreWriterActions.addApiWallet(agentWallet, "engine");
    }
}

contract CoreWriterActionsTest is Test {
    CoreWriterStub coreWriter;

    function setUp() public {
        coreWriter = installCoreWriterStub(vm);
    }

    function test_addApiWallet_writesAction9ToCoreWriter() public {
        AgentWalletRegistrar registrar = new AgentWalletRegistrar();
        address agentWallet = makeAddr("agentWallet");

        registrar.register(agentWallet);

        assertEq(coreWriter.actionCount(), 1);
        (address sender, bytes memory data) = coreWriter.actionAt(0);
        assertEq(sender, address(registrar));
        assertEq(data, abi.encodePacked(uint8(1), uint24(9), abi.encode(agentWallet, "engine")));
    }
}
