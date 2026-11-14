// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {ProtectionFund} from "../src/settlement/ProtectionFund.sol";
import {TestUsdc} from "./stubs/TestUsdc.sol";

contract ProtectionFundTest is Test {
    TestUsdc usdc;
    AgentRegistry registry;
    ProtectionFund fund;

    address engine = makeAddr("engine");
    address builder = makeAddr("builder");
    address treasury = makeAddr("treasury");
    address vault = makeAddr("vault");
    address vault2 = makeAddr("vault2");

    function setUp() public {
        usdc = new TestUsdc();
        // The fund is deployed right after the registry: predict its address so the registry can name it as slasher.
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        registry = new AgentRegistry(IERC20(address(usdc)), engine, predicted);
        fund = new ProtectionFund(IERC20(address(usdc)), engine, registry);
        assertEq(address(fund), predicted);

        usdc.mint(builder, 1_000_000e6);
        usdc.mint(treasury, 1_000_000e6);
        vm.prank(builder);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(treasury);
        usdc.approve(address(fund), type(uint256).max);
    }

    // --- helpers ---

    function _bond(uint256 amount) internal {
        vm.prank(builder);
        registry.register("momentum", 1, amount);
    }

    function _fund(uint256 amount) internal {
        vm.prank(treasury);
        fund.depositToFund(amount);
    }

    function _reserve(uint256 amount) internal {
        vm.prank(treasury);
        fund.depositToReserve(amount);
    }

    function _epochValue(address v, uint256 value) internal {
        vm.prank(engine);
        fund.reportEpochValue(v, value);
    }

    /// A claim with Overshoot `overshootUsdc` (USDC, 6 decimals): a short's stop at 100, size 1, filled above it.
    function _claim(address v, bytes32 id, uint256 overshootUsdc, bool infra)
        internal
        pure
        returns (ProtectionFund.Claim memory)
    {
        return ProtectionFund.Claim({
            vault: v,
            agentId: "momentum",
            positionId: id,
            triggerPriceE8: 100e8,
            fillPriceE8: 100e8 + overshootUsdc * 100, // 1e6 USDC = 1e8 price at size 1
            sizeE8: 1e8,
            infrastructureFailure: infra,
            evidenceHash: keccak256(abi.encode(id)),
            evidenceRef: "ipfs://evidence"
        });
    }

    function _sources(ProtectionFund.Settlement memory s, uint256 reserve, uint256 bond, uint256 fromFund)
        internal
        pure
    {
        assertEq(s.fromReserve, reserve, "from Reserve");
        assertEq(s.fromBond, bond, "from Bond");
        assertEq(s.fromFund, fromFund, "from Fund");
    }

    function _settle(ProtectionFund.Claim memory c) internal {
        ProtectionFund.Claim[] memory cs = new ProtectionFund.Claim[](1);
        cs[0] = c;
        vm.prank(engine);
        fund.settle(cs);
    }

    function _settle(ProtectionFund.Claim memory a, ProtectionFund.Claim memory b) internal {
        ProtectionFund.Claim[] memory cs = new ProtectionFund.Claim[](2);
        cs[0] = a;
        cs[1] = b;
        vm.prank(engine);
        fund.settle(cs);
    }

    // --- Overshoot math ---

    function test_overshoot_isFillMinusTriggerTimesSize() public view {
        // Long stop at 2,000, filled at 1,990 for 0.5 ETH: 5 USDC.
        assertEq(fund.overshootOf(2_000e8, 1_990e8, 0.5e8), 5e6);
        // Short stop at 2,000 filled at 2,010: same Overshoot.
        assertEq(fund.overshootOf(2_000e8, 2_010e8, 0.5e8), 5e6);
        assertEq(fund.overshootOf(2_000e8, 2_000e8, 1e8), 0);
    }

    // --- Infrastructure Failure: Protocol Reserve pays ---

    function test_infra_reservePaysInFull_bondUntouched() public {
        _bond(100e6);
        _reserve(50e6);
        _fund(500e6);
        _settle(_claim(vault, "p1", 20e6, true));
        ProtectionFund.Settlement memory s = fund.settlement("p1");
        _sources(s, 20e6, 0, 0);
        assertEq(usdc.balanceOf(vault), 20e6);
        assertEq(fund.reserveBalance(), 30e6);
        assertEq(registry.agent("momentum").bond, 100e6);
    }

    function test_infra_reserveShort_fundPaysTheRestWithinCap() public {
        _bond(100e6);
        _reserve(5e6);
        _fund(500e6);
        _epochValue(vault, 1_000e6); // cap 100
        _settle(_claim(vault, "p1", 20e6, true));
        ProtectionFund.Settlement memory s = fund.settlement("p1");
        _sources(s, 5e6, 0, 15e6);
        assertEq(registry.agent("momentum").bond, 100e6);
    }

    // --- Market gap: Bond first ---

    function test_gap_bondPaysInFull() public {
        _bond(100e6);
        _reserve(50e6);
        _fund(500e6);
        _settle(_claim(vault, "p1", 30e6, false));
        ProtectionFund.Settlement memory s = fund.settlement("p1");
        _sources(s, 0, 30e6, 0);
        assertEq(usdc.balanceOf(vault), 30e6);
        assertEq(registry.agent("momentum").bond, 70e6);
        assertEq(fund.reserveBalance(), 50e6);
    }

    function test_gap_bondShort_fundPaysTheRest() public {
        _bond(10e6);
        _fund(500e6);
        _epochValue(vault, 1_000e6);
        _settle(_claim(vault, "p1", 30e6, false));
        ProtectionFund.Settlement memory s = fund.settlement("p1");
        _sources(s, 0, 10e6, 20e6);
        assertEq(usdc.balanceOf(vault), 30e6);
        assertEq(fund.fundBalance(), 480e6);
    }

    function test_gap_fundCappedAt10PercentOfEpochStartValue_restUnpaid() public {
        _bond(10e6);
        _fund(500e6);
        _epochValue(vault, 100e6); // cap 10
        _settle(_claim(vault, "p1", 50e6, false));
        ProtectionFund.Settlement memory s = fund.settlement("p1");
        _sources(s, 0, 10e6, 10e6);
        assertEq(usdc.balanceOf(vault), 20e6); // 30 unpaid, never clawed back
    }

    function test_gap_capIsPerEpochAcrossClaims_resetsNextEpoch() public {
        _bond(1); // effectively nothing
        _fund(500e6);
        _epochValue(vault, 100e6); // cap 10
        _settle(_claim(vault, "p1", 6e6, false));
        _settle(_claim(vault, "p2", 6e6, false));
        // p1: 1 wei from the Bond, 6 - 1 wei from the Fund. p2: only what's left of the cap of 10.
        assertEq(fund.settlement("p2").fromFund, 4e6 + 1);
        assertEq(fund.fundPaidInEpoch(vault, 0), 10e6);

        vm.warp(block.timestamp + 1 days);
        _epochValue(vault, 100e6);
        _settle(_claim(vault, "p3", 6e6, false));
        assertEq(fund.settlement("p3").fromFund, 6e6);
    }

    function test_noEpochValueReported_fundPaysNothing() public {
        _fund(500e6);
        _settle(_claim(vault, "p1", 6e6, true));
        assertEq(fund.settlement("p1").fromFund, 0);
    }

    // --- Pro-rata when the Fund is short ---

    function test_fundShort_paysTheBatchProRata() public {
        _fund(30e6);
        _epochValue(vault, 1_000e6);
        _epochValue(vault2, 1_000e6);
        // Infrastructure Failures with no Reserve: both fall to the Fund, asking 40 and 20 of its 30.
        _settle(_claim(vault, "p1", 40e6, true), _claim(vault2, "p2", 20e6, true));
        assertEq(fund.settlement("p1").fromFund, 20e6);
        assertEq(fund.settlement("p2").fromFund, 10e6);
        assertEq(fund.fundBalance(), 0);
        assertEq(fund.fundPaidInEpoch(vault, 0), 20e6); // only what was paid counts toward the cap
    }

    // --- Guards ---

    function test_settle_onlyEngine() public {
        ProtectionFund.Claim[] memory cs = new ProtectionFund.Claim[](1);
        cs[0] = _claim(vault, "p1", 1e6, false);
        vm.expectRevert(ProtectionFund.NotEngine.selector);
        fund.settle(cs);
        vm.expectRevert(ProtectionFund.NotEngine.selector);
        fund.reportEpochValue(vault, 1);
        vm.expectRevert(ProtectionFund.NotEngine.selector);
        fund.reportExposure(1);
    }

    function test_settle_oncePerPosition() public {
        _reserve(50e6);
        _settle(_claim(vault, "p1", 1e6, true));
        ProtectionFund.Claim[] memory cs = new ProtectionFund.Claim[](1);
        cs[0] = _claim(vault, "p1", 1e6, true);
        vm.prank(engine);
        vm.expectRevert(abi.encodeWithSelector(ProtectionFund.AlreadySettled.selector, bytes32("p1")));
        fund.settle(cs);
    }

    function test_settle_rejectsNoOvershoot() public {
        ProtectionFund.Claim memory c = _claim(vault, "p1", 0, true);
        ProtectionFund.Claim[] memory cs = new ProtectionFund.Claim[](1);
        cs[0] = c;
        vm.prank(engine);
        vm.expectRevert(abi.encodeWithSelector(ProtectionFund.NoOvershoot.selector, bytes32("p1")));
        fund.settle(cs);
    }

    function test_records_evidenceAndClaimIds() public {
        _reserve(50e6);
        _settle(_claim(vault, "p1", 1e6, true));
        ProtectionFund.Settlement memory s = fund.settlement("p1");
        assertEq(s.evidenceHash, keccak256(abi.encode(bytes32("p1"))));
        assertEq(s.evidenceRef, "ipfs://evidence");
        assertEq(s.agentId, "momentum");
        assertEq(fund.claimIds().length, 1);
    }

    // --- Coverage Ratio ---

    function test_coverageRatio() public {
        _fund(500e6);
        assertEq(fund.coverageRatioBps(), type(uint256).max);
        vm.prank(engine);
        fund.reportExposure(2_000e6);
        assertEq(fund.coverageRatioBps(), 2_500); // 25%
    }

    // --- Invariants (fuzz) ---

    function testFuzz_payoutNeverExceedsOvershoot_fundNeverExceedsCap(
        uint96 bond,
        uint96 reserve,
        uint96 fundSeed,
        uint96 epochValue,
        uint64 overshootA,
        uint64 overshootB,
        bool infraA,
        bool infraB
    ) public {
        bond = uint96(bound(bond, 0, 100_000e6));
        reserve = uint96(bound(reserve, 0, 100_000e6));
        fundSeed = uint96(bound(fundSeed, 0, 100_000e6));
        epochValue = uint96(bound(epochValue, 0, 10_000_000e6));
        overshootA = uint64(bound(overshootA, 1, 100_000e6));
        overshootB = uint64(bound(overshootB, 1, 100_000e6));
        if (bond > 0) _bond(bond);
        else _bond(1);
        if (reserve > 0) _reserve(reserve);
        if (fundSeed > 0) _fund(fundSeed);
        _epochValue(vault, epochValue);
        uint256 before = usdc.balanceOf(vault);

        _settle(_claim(vault, "a", overshootA, infraA), _claim(vault, "b", overshootB, infraB));

        uint256 paidTotal;
        uint256 fromFund;
        bytes32[2] memory ids = [bytes32("a"), bytes32("b")];
        for (uint256 i; i < 2; i++) {
            ProtectionFund.Settlement memory s = fund.settlement(ids[i]);
            uint256 paid = s.fromReserve + s.fromBond + s.fromFund;
            assertLe(paid, s.overshoot, "payout > Overshoot");
            if (s.infrastructureFailure) assertEq(s.fromBond, 0, "Bond slashed for Infrastructure Failure");
            else assertEq(s.fromReserve, 0, "Reserve paid a market gap");
            paidTotal += paid;
            fromFund += s.fromFund;
        }
        assertLe(fromFund, uint256(epochValue) * 1_000 / 10_000, "Fund over the 10% cap");
        assertLe(fromFund, fundSeed, "Fund paid more than it holds");
        assertEq(usdc.balanceOf(vault) - before, paidTotal, "Vault got what was recorded");
    }
}
