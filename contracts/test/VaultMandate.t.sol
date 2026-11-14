// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/vault/Vault.sol";
import {VaultFactory} from "../src/vault/VaultFactory.sol";
import {MandateRegistry} from "../src/vault/MandateRegistry.sol";
import {CoreWriterStub, installCoreWriterStub} from "./stubs/CoreWriterStub.sol";

contract VaultMandateTest is Test {
    CoreWriterStub coreWriter;
    VaultFactory factory;
    MandateRegistry registry;
    Vault vault;

    address engine = makeAddr("engine");
    address user = makeAddr("user");
    address agentWallet = makeAddr("agentWallet");

    bytes constant JSON_V1 = '{"allowedAssets":["BTC","ETH"],"leverageCap":3}';
    bytes constant JSON_V2 = '{"allowedAssets":["BTC"],"leverageCap":2}';

    function setUp() public {
        coreWriter = installCoreWriterStub(vm);
        factory = new VaultFactory(engine);
        registry = new MandateRegistry();
        vm.prank(user);
        vault = factory.createVault(agentWallet);
    }

    function _sign(bytes memory json, uint32 lev, uint16 sl, uint16 dd, uint64 veto, bool scopeNotLoosened)
        internal
        returns (uint256)
    {
        vm.prank(user);
        return registry.signMandateVersion(vault, json, lev, sl, dd, veto, false, scopeNotLoosened);
    }

    function _openPosition() internal {
        vm.prank(engine);
        vault.reportFlat(false);
    }

    // --- Vault ---

    function test_createVault_setsOwnerAndRegistersAgentWallet() public view {
        assertEq(vault.owner(), user);
        assertEq(vault.engine(), engine);
        assertEq(vault.agentWallet(), agentWallet);
        assertTrue(factory.isVault(address(vault)));
        assertTrue(vault.isFlat());

        assertEq(coreWriter.actionCount(), 1);
        (address sender, bytes memory data) = coreWriter.actionAt(0);
        assertEq(sender, address(vault));
        assertEq(data, abi.encodePacked(uint8(1), uint24(9), abi.encode(agentWallet, "engine")));
    }

    function test_createVault_setsDepositTarget() public {
        assertEq(factory.depositTargetOf(user), address(vault));
        vm.prank(user);
        Vault second = factory.createVault(agentWallet);
        assertEq(factory.depositTargetOf(user), address(second));
        vm.prank(user);
        factory.setDepositTarget(address(vault));
        assertEq(factory.depositTargetOf(user), address(vault));
    }

    function test_setDepositTarget_onlyOwnerOfFactoryVault() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(VaultFactory.NotVaultOwner.selector);
        factory.setDepositTarget(address(vault));

        vm.prank(user);
        vm.expectRevert(VaultFactory.NotVaultOwner.selector);
        factory.setDepositTarget(makeAddr("notAVault"));
    }

    function test_onlyEngine_canReportFlatOrRegisterAgentWallet() public {
        vm.startPrank(user);
        vm.expectRevert(Vault.NotEngine.selector);
        vault.reportFlat(false);
        vm.expectRevert(Vault.NotEngine.selector);
        vault.registerAgentWallet(user);
        vm.stopPrank();
    }

    // --- Mandate Versions ---

    function test_onlyVaultOwner_canSignMandateVersion() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(MandateRegistry.NotVaultOwner.selector);
        registry.signMandateVersion(vault, JSON_V1, 300, 500, 2000, 100e6, false, true);

        vm.prank(engine);
        vm.expectRevert(MandateRegistry.NotVaultOwner.selector);
        registry.signMandateVersion(vault, JSON_V1, 300, 500, 2000, 100e6, false, true);
    }

    function test_firstVersion_isEffectiveAndStoresHash() public {
        uint256 v = _sign(JSON_V1, 300, 500, 2000, 100e6, true);
        (uint256 version, MandateRegistry.MandateVersion memory m) = registry.currentMandate(address(vault));
        assertEq(v, 1);
        assertEq(version, 1);
        assertEq(m.mandateHash, keccak256(JSON_V1));
        assertEq(m.leverageCapE2, 300);
        assertEq(m.signedAt, block.timestamp);
    }

    function test_tighterVersion_isEffectiveImmediatelyWithOpenPositions() public {
        _sign(JSON_V1, 300, 500, 2000, 100e6, true);
        _openPosition();
        _sign(JSON_V2, 200, 300, 1000, 50e6, true);
        assertEq(registry.effectiveVersion(address(vault)), 2);
        assertEq(registry.pendingVersion(address(vault)), 0);
    }

    function test_looserVersion_waitsUntilFlat() public {
        _sign(JSON_V1, 300, 500, 2000, 100e6, true);
        _openPosition();
        _sign(JSON_V2, 500, 500, 2000, 100e6, true); // higher leverage cap

        assertEq(registry.effectiveVersion(address(vault)), 1);
        assertEq(registry.pendingVersion(address(vault)), 2);

        vm.expectRevert(MandateRegistry.VaultNotFlat.selector);
        registry.activatePending(vault);

        vm.prank(engine);
        vault.reportFlat(true);
        registry.activatePending(vault); // permissionless
        assertEq(registry.effectiveVersion(address(vault)), 2);
        assertEq(registry.pendingVersion(address(vault)), 0);
    }

    function test_loosenedScope_waitsUntilFlat() public {
        _sign(JSON_V1, 300, 500, 2000, 100e6, true);
        _openPosition();
        _sign(JSON_V2, 300, 500, 2000, 100e6, false); // same caps, more assets
        assertEq(registry.effectiveVersion(address(vault)), 1);
        assertEq(registry.pendingVersion(address(vault)), 2);
    }

    function test_droppingKillFlag_isLooser() public {
        vm.prank(user);
        registry.signMandateVersion(vault, JSON_V1, 300, 500, 2000, 100e6, true, true);
        _openPosition();
        _sign(JSON_V1, 300, 500, 2000, 100e6, true); // kill flag off
        assertEq(registry.effectiveVersion(address(vault)), 1);
    }

    function test_looserVersion_whenFlat_isEffectiveImmediately() public {
        _sign(JSON_V1, 300, 500, 2000, 100e6, true);
        _sign(JSON_V2, 500, 800, 3000, 500e6, false);
        assertEq(registry.effectiveVersion(address(vault)), 2);
    }

    function test_tighterVersion_discardsPendingLooser() public {
        _sign(JSON_V1, 300, 500, 2000, 100e6, true);
        _openPosition();
        _sign(JSON_V2, 500, 500, 2000, 100e6, true); // pending
        _sign(JSON_V2, 200, 500, 2000, 100e6, true); // tighter: effective, pending dropped
        assertEq(registry.effectiveVersion(address(vault)), 3);
        assertEq(registry.pendingVersion(address(vault)), 0);
        vm.expectRevert(MandateRegistry.NoPendingVersion.selector);
        registry.activatePending(vault);
    }

    function test_history_keepsEveryVersion() public {
        _sign(JSON_V1, 300, 500, 2000, 100e6, true);
        _sign(JSON_V2, 200, 300, 1000, 50e6, true);
        assertEq(registry.versionCount(address(vault)), 2);
        assertEq(registry.versionAt(address(vault), 1).mandateHash, keccak256(JSON_V1));
        assertEq(registry.versionAt(address(vault), 2).mandateHash, keccak256(JSON_V2));
    }

    function test_signedEvent_carriesMandateJson() public {
        vm.expectEmit(address(registry));
        emit MandateRegistry.MandateVersionSigned(address(vault), 1, keccak256(JSON_V1), JSON_V1);
        _sign(JSON_V1, 300, 500, 2000, 100e6, true);
    }
}
