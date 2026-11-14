// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DecisionLog} from "../src/vault/DecisionLog.sol";

contract DecisionLogTest is Test {
    DecisionLog decisions;

    address engine = makeAddr("engine");
    address vault = makeAddr("vault");
    address stranger = makeAddr("stranger");

    bytes32 constant H1 = keccak256("decision-1");
    bytes32 constant H2 = keccak256("decision-2");

    event DecisionCommitted(
        uint256 indexed index, address indexed vault, bytes32 indexed decisionHash, string agentId, uint64 timestamp
    );

    function setUp() public {
        decisions = new DecisionLog(engine);
        vm.warp(1_794_636_000);
    }

    function test_commit_recordsTheDecisionAndEmits() public {
        vm.expectEmit(address(decisions));
        emit DecisionCommitted(0, vault, H1, "momentum", 1_794_636_000);
        vm.prank(engine);
        uint256 index = decisions.commit(vault, "momentum", H1);

        assertEq(index, 0);
        assertEq(decisions.count(), 1);
        DecisionLog.DecisionCommitment memory c = decisions.commitmentAt(0);
        assertEq(c.vault, vault);
        assertEq(c.agentId, "momentum");
        assertEq(c.decisionHash, H1);
        assertEq(c.timestamp, 1_794_636_000);
        (bool committed, uint64 ts) = decisions.isCommitted(H1);
        assertTrue(committed);
        assertEq(ts, 1_794_636_000);
    }

    function test_commit_onlyTheEngine() public {
        vm.prank(stranger);
        vm.expectRevert(DecisionLog.NotEngine.selector);
        decisions.commit(vault, "momentum", H1);
        assertEq(decisions.count(), 0);
    }

    function test_commit_rejectsTheSameDecisionTwice() public {
        vm.startPrank(engine);
        decisions.commit(vault, "momentum", H1);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.AlreadyCommitted.selector, H1));
        decisions.commit(vault, "other-agent", H1);
        vm.stopPrank();
        assertEq(decisions.count(), 1);
        assertEq(decisions.commitmentAt(0).agentId, "momentum");
    }

    function test_commit_rejectsAZeroHash() public {
        vm.prank(engine);
        vm.expectRevert(DecisionLog.ZeroHash.selector);
        decisions.commit(vault, "momentum", bytes32(0));
    }

    /// Append-only: later commitments never change earlier ones, and indexes only grow.
    function test_appendOnly_earlierEntriesNeverChange() public {
        vm.prank(engine);
        decisions.commit(vault, "momentum", H1);
        vm.warp(1_794_636_060);
        vm.prank(engine);
        uint256 second = decisions.commit(makeAddr("vault-2"), "funding-arb", H2);

        assertEq(second, 1);
        DecisionLog.DecisionCommitment memory first = decisions.commitmentAt(0);
        assertEq(first.vault, vault);
        assertEq(first.decisionHash, H1);
        assertEq(first.timestamp, 1_794_636_000);
        assertEq(decisions.positionOf(H1), 1);
        assertEq(decisions.positionOf(H2), 2);
    }

    function test_isCommitted_falseForUnknownDecisions() public view {
        (bool committed, uint64 ts) = decisions.isCommitted(H2);
        assertFalse(committed);
        assertEq(ts, 0);
    }

    function testFuzz_appendOnly(bytes32[8] memory hashes) public {
        uint256 n;
        for (uint256 i; i < hashes.length; i++) {
            if (hashes[i] == bytes32(0) || decisions.positionOf(hashes[i]) != 0) continue;
            vm.prank(engine);
            assertEq(decisions.commit(vault, "momentum", hashes[i]), n);
            n++;
            for (uint256 j; j < n; j++) {
                assertEq(decisions.positionOf(decisions.commitmentAt(j).decisionHash), j + 1);
            }
        }
        assertEq(decisions.count(), n);
    }
}
