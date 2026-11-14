// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {ProtectionFund} from "../src/settlement/ProtectionFund.sol";
import {FeeRouter} from "../src/settlement/FeeRouter.sol";
import {Vault} from "../src/vault/Vault.sol";
import {VaultFactory} from "../src/vault/VaultFactory.sol";
import {HyperEvmCctp} from "../src/cctp/HyperEvmCctp.sol";
import {CoreWriterStub, installCoreWriterStub} from "./stubs/CoreWriterStub.sol";
import {TestUsdc} from "./stubs/TestUsdc.sol";

contract FeeRouterTest is Test {
    CoreWriterStub coreWriter;
    TestUsdc usdc;
    AgentRegistry registry;
    ProtectionFund fund;
    FeeRouter router;
    Vault vault;

    address engine = makeAddr("engine");
    address builder = makeAddr("builder");
    address treasury = makeAddr("treasury");
    address user = makeAddr("user");

    function setUp() public {
        coreWriter = installCoreWriterStub(vm);
        vm.etch(HyperEvmCctp.USDC, address(new TestUsdc()).code);
        usdc = TestUsdc(HyperEvmCctp.USDC);
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        registry = new AgentRegistry(IERC20(address(usdc)), engine, predicted);
        fund = new ProtectionFund(IERC20(address(usdc)), engine, registry);
        router = new FeeRouter(IERC20(address(usdc)), engine, registry, fund, treasury);
        VaultFactory factory = new VaultFactory(engine, address(router));
        vm.prank(user);
        vault = factory.createVault(makeAddr("agentWallet"));

        usdc.mint(builder, 1_000e6);
        vm.startPrank(builder);
        usdc.approve(address(registry), type(uint256).max);
        registry.register("momentum", 1, 100e6);
        vm.stopPrank();
    }

    // --- helpers ---

    function _settle(uint64 epoch, uint256 value, int256 flows, uint32 ratePpm, uint256 notional) internal {
        vm.prank(engine);
        router.settleEpoch(address(vault), epoch, value, flows, "momentum", ratePpm, notional);
    }

    function _settle(uint64 epoch, uint256 value) internal {
        _settle(epoch, value, 0, 0, 0);
    }

    /// HyperCore applies the Vault's collection a block later: the USDC lands at its HyperEVM address.
    function _land(uint256 amount) internal {
        usdc.mint(address(vault), amount);
    }

    // --- High-Water Mark ---

    function test_firstSettlementSetsHighWaterMark_noFee() public {
        _settle(1, 1_000e6);
        assertEq(router.highWaterMark(address(vault)), 1_000e6);
        FeeRouter.EpochReport memory r = router.latest(address(vault));
        assertEq(r.profit, 0);
        assertEq(router.owed(address(vault)), 0);
    }

    function test_noFeeOnRecoveredLosses() public {
        _settle(1, 1_000e6);
        _settle(2, 900e6); // loss
        assertEq(router.latest(address(vault)).profit, 0);
        assertEq(router.highWaterMark(address(vault)), 1_000e6);
        _settle(3, 1_000e6); // recovered: still not above the High-Water Mark
        assertEq(router.latest(address(vault)).profit, 0);
        assertEq(router.owed(address(vault)), 0);
        _settle(4, 1_100e6); // 100 above it
        FeeRouter.EpochReport memory r = router.latest(address(vault));
        assertEq(r.profit, 100e6);
        assertEq(r.builderFee, 12e6);
        assertEq(r.protocolFee, 3e6);
        assertEq(r.profitPremium, 3e6);
        assertEq(router.highWaterMark(address(vault)), 1_100e6);
        assertEq(router.owed(address(vault)), 18e6);
    }

    function test_depositsAreNotProfit_withdrawalsAreNotLoss() public {
        _settle(1, 1_000e6);
        _settle(2, 1_500e6, 500e6, 0, 0); // a 500 deposit
        assertEq(router.latest(address(vault)).profit, 0);
        assertEq(router.highWaterMark(address(vault)), 1_500e6);
        _settle(3, 1_050e6, -500e6, 0, 0); // a 500 withdrawal, then 50 profit
        assertEq(router.latest(address(vault)).profit, 50e6);
        assertEq(router.highWaterMark(address(vault)), 1_050e6);
    }

    function test_feeCollectionOutflowDoesNotLowerTheNextProfit() public {
        _settle(1, 1_000e6);
        _settle(2, 1_100e6); // 18 charged, leaves the Vault before next Epoch (an outflow on the ledger)
        _settle(3, 1_082e6, -18e6, 0, 0);
        assertEq(router.latest(address(vault)).profit, 0);
        _settle(4, 1_182e6);
        assertEq(router.latest(address(vault)).profit, 100e6);
    }

    function test_flowsBelowZeroClampHighWaterMark() public {
        _settle(1, 100e6);
        _settle(2, 5e6, -200e6, 0, 0);
        assertEq(router.latest(address(vault)).highWaterMark, 0);
        assertEq(router.latest(address(vault)).profit, 5e6);
    }

    // --- split and payout ---

    function test_splitPaysBuilderTreasuryAndFund() public {
        _settle(1, 1_000e6);
        _settle(2, 1_100e6, 0, 450, 2_000e6); // 100 profit; base premium 4.5 bps x 2,000 = 0.9
        FeeRouter.Due[] memory d = router.dues(address(vault));
        assertEq(d.length, 1);
        assertEq(d[0].builder, builder);
        assertEq(d[0].builderAmount, 12e6);
        assertEq(d[0].treasuryAmount, 2.25e6); // 75% of the 3% protocol fee
        assertEq(d[0].fundAmount, 0.75e6 + 3e6 + 0.9e6); // 25% of protocol + profit premium + base premium
        assertEq(router.owed(address(vault)), 18.9e6);

        _land(18.9e6);
        router.distribute(address(vault));
        assertEq(usdc.balanceOf(builder), 900e6 + 12e6);
        assertEq(usdc.balanceOf(treasury), 2.25e6);
        assertEq(fund.fundBalance(), 4.65e6);
        assertEq(router.owed(address(vault)), 0);
        assertEq(router.dues(address(vault)).length, 0);
        assertEq(vault.feesPending(), 0);
    }

    function test_basePremiumChargedEvenAtALoss() public {
        _settle(1, 1_000e6);
        _settle(2, 900e6, 0, 1_000, 5_000e6); // 10 bps x 5,000 = 5
        FeeRouter.EpochReport memory r = router.latest(address(vault));
        assertEq(r.profit, 0);
        assertEq(r.basePremium, 5e6);
        assertEq(router.owed(address(vault)), 5e6);
    }

    function test_noLeadAgent_builderShareGoesToTreasury() public {
        _settle(1, 1_000e6);
        vm.prank(engine);
        router.settleEpoch(address(vault), 2, 1_100e6, 0, "", 0, 0);
        assertEq(router.dues(address(vault))[0].builder, treasury);
    }

    function test_unregisteredAgent_builderShareGoesToTreasury() public {
        _settle(1, 1_000e6);
        vm.prank(engine);
        router.settleEpoch(address(vault), 2, 1_100e6, 0, "nobody", 0, 0);
        assertEq(router.dues(address(vault))[0].builder, treasury);
    }

    function test_settleRequestsCollectionFromTheVault() public {
        _settle(1, 1_000e6);
        uint256 before = coreWriter.actionCount();
        _settle(2, 1_100e6);
        assertEq(vault.feesPending(), 18e6);
        assertEq(coreWriter.actionCount(), before + 2); // perp -> spot, spot -> HyperEVM
        (, bytes memory classTransfer) = coreWriter.actionAt(before);
        assertEq(
            classTransfer,
            abi.encodePacked(uint8(1), uint24(7), abi.encode(uint64(18e6 + vault.SPOT_SEND_FEE_BUFFER()), false))
        );
        (, bytes memory spotSend) = coreWriter.actionAt(before + 1);
        assertEq(
            spotSend,
            abi.encodePacked(
                uint8(1), uint24(6), abi.encode(HyperEvmCctp.USDC_SYSTEM_ADDRESS, uint64(0), uint64(18e6 * 100))
            )
        );
    }

    function test_tinyChargesAccrueUntilWorthCollecting() public {
        _settle(1, 1_000e6);
        uint256 before = coreWriter.actionCount();
        _settle(2, 1_000e6, 0, 100, 500e6); // 0.05 USDC base premium
        assertEq(coreWriter.actionCount(), before);
        _settle(3, 1_000e6, 0, 100, 500e6); // 0.1 USDC owed: collect
        assertEq(coreWriter.actionCount(), before + 2);
        assertEq(vault.feesPending(), 0.1e6);
    }

    function test_partialArrivalPaysOldestFullyCoveredChargeOnly() public {
        _settle(1, 1_000e6);
        _settle(2, 1_100e6); // 18
        _settle(3, 1_200e6); // 18 more
        _land(20e6);
        router.distribute(address(vault));
        assertEq(router.dues(address(vault)).length, 1);
        assertEq(router.received(address(vault)), 2e6);
        assertEq(usdc.balanceOf(builder), 900e6 + 12e6);
        _land(16e6);
        router.distribute(address(vault));
        assertEq(router.dues(address(vault)).length, 0);
        assertEq(router.owed(address(vault)), 0);
        assertEq(usdc.balanceOf(builder), 900e6 + 24e6);
    }

    function test_droppedCollectionIsAskedAgainNextEpoch() public {
        _settle(1, 1_000e6);
        _settle(2, 1_100e6); // HyperCore drops this collection: nothing lands
        router.distribute(address(vault));
        assertEq(router.owed(address(vault)), 18e6);
        _settle(3, 1_100e6); // no new profit; the 18 is asked for again
        assertEq(vault.feesPending(), 18e6);
    }

    function test_payFeesNeverTakesMoreThanCollected() public {
        _settle(1, 1_000e6);
        _settle(2, 1_100e6);
        _land(50e6); // the owner's own withdrawal landed too
        router.distribute(address(vault));
        assertEq(usdc.balanceOf(address(vault)), 32e6);
    }

    function test_bridgeOutCannotSpendFeesPending() public {
        _settle(1, 1_000e6);
        _settle(2, 1_100e6);
        _land(18e6);
        vm.prank(user);
        vm.expectRevert(Vault.FeesReserved.selector);
        vault.bridgeOut(1e6, 6, bytes32(uint256(1)), 0);
    }

    // --- tiers and access ---

    function test_tiers() public view {
        assertEq(uint8(router.tierOf(0)), uint8(FeeRouter.Tier.Low));
        assertEq(uint8(router.tierOf(299)), uint8(FeeRouter.Tier.Low));
        assertEq(uint8(router.tierOf(300)), uint8(FeeRouter.Tier.Medium));
        assertEq(uint8(router.tierOf(799)), uint8(FeeRouter.Tier.Medium));
        assertEq(uint8(router.tierOf(800)), uint8(FeeRouter.Tier.High));
    }

    function test_onlyEngine_oncePerEpoch() public {
        vm.expectRevert(FeeRouter.NotEngine.selector);
        router.settleEpoch(address(vault), 1, 1e6, 0, "momentum", 0, 0);
        _settle(1, 1e6);
        vm.prank(engine);
        vm.expectRevert(abi.encodeWithSelector(FeeRouter.EpochAlreadySettled.selector, address(vault), 1));
        router.settleEpoch(address(vault), 1, 1e6, 0, "momentum", 0, 0);
    }

    function test_onlyFeeRouterCollectsAndPays() public {
        vm.expectRevert(Vault.NotFeeRouter.selector);
        vault.collectFees(1e6);
        vm.prank(engine);
        vm.expectRevert(Vault.NotFeeRouter.selector);
        vault.payFees();
    }

    function testFuzz_feesNeverExceed18PercentOfProfitAboveHighWaterMark(uint128 start, uint128 end, uint32 rate)
        public
    {
        start = uint128(bound(start, 1, 1e15));
        end = uint128(bound(end, 0, 1e15));
        _settle(1, start);
        _settle(2, end, 0, uint32(bound(rate, 0, 10_000)), 0);
        FeeRouter.EpochReport memory r = router.latest(address(vault));
        uint256 profit = end > start ? end - start : 0;
        assertEq(r.profit, profit);
        assertLe(r.builderFee + r.protocolFee + r.profitPremium, profit * 18 / 100);
        assertEq(router.highWaterMark(address(vault)), end > start ? end : start);
    }
}
