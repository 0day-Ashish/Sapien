// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {TestUsdc} from "./stubs/TestUsdc.sol";

contract AgentRegistryTest is Test {
    AgentRegistry registry;
    TestUsdc usdc;

    address engine = makeAddr("engine");
    address builder = makeAddr("builder");
    address stranger = makeAddr("stranger");
    address vault1 = makeAddr("vault1");
    address vault2 = makeAddr("vault2");
    address claimant = makeAddr("claimant");

    uint8 constant TREND = 1;

    function setUp() public {
        usdc = new TestUsdc();
        registry = new AgentRegistry(IERC20(address(usdc)), engine);
        usdc.mint(builder, 10_000e6);
        vm.prank(builder);
        usdc.approve(address(registry), type(uint256).max);
    }

    function _register(uint256 bond) internal {
        vm.prank(builder);
        registry.register("momentum", TREND, bond);
    }

    // --- stake ---

    function test_register_stakesTheBond() public {
        vm.expectEmit();
        emit AgentRegistry.AgentRegistered("momentum", builder, TREND);
        vm.expectEmit();
        emit AgentRegistry.BondToppedUp("momentum", 100e6, 100e6);
        _register(100e6);

        AgentRegistry.Agent memory a = registry.agent("momentum");
        assertEq(a.builder, builder);
        assertEq(a.regimes, TREND);
        assertEq(a.bond, 100e6);
        assertEq(usdc.balanceOf(address(registry)), 100e6);
        assertEq(usdc.balanceOf(builder), 9_900e6);
        assertTrue(registry.meetsBondMinimum("momentum"));
    }

    function test_register_rejectsTakenIdEmptyIdAndNoRegimes() public {
        _register(1e6);
        vm.prank(stranger);
        vm.expectRevert(AgentRegistry.AgentExists.selector);
        registry.register("momentum", TREND, 0);
        vm.expectRevert(AgentRegistry.EmptyAgentId.selector);
        registry.register("", TREND, 0);
        vm.expectRevert(AgentRegistry.NoRegimes.selector);
        registry.register("x", 0, 0);
    }

    function test_unbondedAgent_doesNotMeetBondMinimum() public {
        _register(0);
        assertFalse(registry.meetsBondMinimum("momentum"));
        assertFalse(registry.meetsBondMinimum("never-registered"));
    }

    // --- top-up ---

    function test_topUp_addsToTheBond() public {
        _register(100e6);
        vm.prank(builder);
        vm.expectEmit();
        emit AgentRegistry.BondToppedUp("momentum", 50e6, 150e6);
        registry.topUp("momentum", 50e6);
        assertEq(registry.agent("momentum").bond, 150e6);
        assertEq(usdc.balanceOf(address(registry)), 150e6);
    }

    function test_topUp_builderOnly() public {
        _register(100e6);
        usdc.mint(stranger, 1e6);
        vm.prank(stranger);
        vm.expectRevert(AgentRegistry.NotBuilder.selector);
        registry.topUp("momentum", 1e6);
    }

    function test_topUp_liftsAnAgentBackAboveItsBondMinimum() public {
        _register(40e6);
        vm.prank(engine);
        registry.reportLead(vault1, "momentum", 1_000e6); // minimum 50 USDC
        assertEq(registry.bondMinimum("momentum"), 50e6);
        assertFalse(registry.meetsBondMinimum("momentum"));

        vm.prank(builder);
        registry.topUp("momentum", 10e6);
        assertTrue(registry.meetsBondMinimum("momentum"));
    }

    // --- Bond Minimum ---

    function test_bondMinimum_isFivePercentOfAllLedVaults() public {
        _register(100e6);
        vm.startPrank(engine);
        registry.reportLead(vault1, "momentum", 1_000e6);
        registry.reportLead(vault2, "momentum", 1_000e6);
        assertEq(registry.bondMinimum("momentum"), 100e6);
        assertTrue(registry.meetsBondMinimum("momentum"));

        // vault1 grows: 5% of 3,000 = 150 > 100
        registry.reportLead(vault1, "momentum", 2_000e6);
        assertEq(registry.bondMinimum("momentum"), 150e6);
        assertFalse(registry.meetsBondMinimum("momentum"));

        // the agent stops leading vault1
        registry.reportLead(vault1, "", 0);
        vm.stopPrank();
        assertEq(registry.bondMinimum("momentum"), 50e6);
        assertEq(registry.agent("momentum").ledVaults, 1);
        assertTrue(registry.meetsBondMinimum("momentum"));
    }

    function test_reportLead_movesTheVaultBetweenAgents() public {
        _register(100e6);
        vm.prank(builder);
        registry.register("funding-arb", 8, 100e6);

        vm.startPrank(engine);
        registry.reportLead(vault1, "momentum", 1_000e6);
        registry.reportLead(vault1, "funding-arb", 1_200e6);
        vm.stopPrank();

        assertEq(registry.agent("momentum").ledVaults, 0);
        assertEq(registry.agent("momentum").ledValue, 0);
        assertEq(registry.agent("funding-arb").ledVaults, 1);
        assertEq(registry.agent("funding-arb").ledValue, 1_200e6);
        (bytes32 k, uint256 v) = registry.leadOf(vault1);
        assertEq(k, keccak256("funding-arb"));
        assertEq(v, 1_200e6);
    }

    function test_reportLead_engineOnly_andKnownAgentsOnly() public {
        _register(100e6);
        vm.prank(builder);
        vm.expectRevert(AgentRegistry.NotEngine.selector);
        registry.reportLead(vault1, "momentum", 1e6);
        vm.prank(engine);
        vm.expectRevert(AgentRegistry.UnknownAgent.selector);
        registry.reportLead(vault1, "ghost", 1e6);
    }

    // --- Unbonding ---

    function test_unbonding_onlyWhileLeadingNoVault() public {
        _register(100e6);
        vm.prank(engine);
        registry.reportLead(vault1, "momentum", 1_000e6);
        vm.prank(builder);
        vm.expectRevert(AgentRegistry.LeadsVaults.selector);
        registry.startUnbonding("momentum");

        vm.prank(engine);
        registry.reportLead(vault1, "", 0);
        vm.prank(builder);
        registry.startUnbonding("momentum");
        assertEq(registry.agent("momentum").unbondingEndsAt, block.timestamp + 3 days);
    }

    function test_unbonding_builderOnly() public {
        _register(100e6);
        vm.prank(stranger);
        vm.expectRevert(AgentRegistry.NotBuilder.selector);
        registry.startUnbonding("momentum");
    }

    function test_unbonding_withdrawsOnlyAfterThreeDays() public {
        _register(100e6);
        vm.prank(builder);
        vm.expectEmit();
        emit AgentRegistry.UnbondingStarted("momentum", 100e6, uint64(block.timestamp + 3 days));
        registry.startUnbonding("momentum");

        vm.warp(block.timestamp + 3 days - 1);
        vm.prank(builder);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.UnbondingNotOver.selector, uint64(block.timestamp + 1)));
        registry.withdrawBond("momentum");

        vm.warp(block.timestamp + 1);
        vm.prank(builder);
        vm.expectEmit();
        emit AgentRegistry.BondWithdrawn("momentum", builder, 100e6);
        registry.withdrawBond("momentum");
        assertEq(usdc.balanceOf(builder), 10_000e6);
        assertEq(registry.agent("momentum").bond, 0);
        assertEq(registry.agent("momentum").unbondingEndsAt, 0);
    }

    function test_withdraw_needsUnbondingFirst() public {
        _register(100e6);
        vm.prank(builder);
        vm.expectRevert(AgentRegistry.NotUnbonding.selector);
        registry.withdrawBond("momentum");
    }

    function test_unbonding_agentCannotLeadOrOpen() public {
        _register(100e6);
        vm.prank(builder);
        registry.startUnbonding("momentum");
        assertFalse(registry.meetsBondMinimum("momentum"));
        vm.prank(engine);
        vm.expectRevert(AgentRegistry.Unbonding.selector);
        registry.reportLead(vault1, "momentum", 1e6);
        vm.prank(builder);
        vm.expectRevert(AgentRegistry.AlreadyUnbonding.selector);
        registry.startUnbonding("momentum");
    }

    function test_unbonding_bondIsLockedAndStillSlashable() public {
        _register(100e6);
        vm.prank(builder);
        registry.startUnbonding("momentum");
        vm.prank(engine);
        registry.slash("momentum", 30e6, claimant);

        vm.warp(block.timestamp + 3 days);
        vm.prank(builder);
        assertEq(registry.withdrawBond("momentum"), 70e6);
        assertEq(usdc.balanceOf(builder), 9_970e6);
        assertEq(usdc.balanceOf(claimant), 30e6);
    }

    // --- slash ---

    function test_slash_paysTheClaimantFromTheBond() public {
        _register(100e6);
        vm.prank(engine);
        vm.expectEmit();
        emit AgentRegistry.BondSlashed("momentum", 40e6, 40e6, claimant, 60e6);
        uint256 slashed = registry.slash("momentum", 40e6, claimant);
        assertEq(slashed, 40e6);
        assertEq(registry.agent("momentum").bond, 60e6);
        assertEq(usdc.balanceOf(claimant), 40e6);
    }

    function test_slash_isCappedAtTheBond() public {
        _register(100e6);
        vm.prank(engine);
        uint256 slashed = registry.slash("momentum", 250e6, claimant);
        assertEq(slashed, 100e6);
        assertEq(registry.agent("momentum").bond, 0);
        assertEq(usdc.balanceOf(claimant), 100e6);
        assertFalse(registry.meetsBondMinimum("momentum"));
    }

    function test_slash_restrictedToTheExecutionEngine() public {
        _register(100e6);
        address[3] memory notEngine = [builder, stranger, claimant];
        for (uint256 i; i < notEngine.length; i++) {
            vm.prank(notEngine[i]);
            vm.expectRevert(AgentRegistry.NotEngine.selector);
            registry.slash("momentum", 1e6, notEngine[i]);
        }
        assertEq(registry.agent("momentum").bond, 100e6);
    }

    function test_slash_unknownAgentReverts() public {
        vm.prank(engine);
        vm.expectRevert(AgentRegistry.UnknownAgent.selector);
        registry.slash("ghost", 1e6, claimant);
    }
}
