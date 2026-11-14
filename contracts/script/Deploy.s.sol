// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VaultFactory} from "../src/vault/VaultFactory.sol";
import {MandateRegistry} from "../src/vault/MandateRegistry.sol";

/// @notice Deploys VaultFactory + MandateRegistry to HyperEVM testnet.
/// ENGINE_ADDRESS = Execution Engine operator (reports Flat, re-registers Agent Wallets).
/// FEE_ROUTER_ADDRESS = the FeeRouter (#17) that collects Epoch fees from each Vault.
/// forge script script/Deploy.s.sol --rpc-url hyperevm_testnet --broadcast --account <keystore>
contract Deploy is Script {
    function run() external returns (VaultFactory factory, MandateRegistry registry) {
        address engine = vm.envAddress("ENGINE_ADDRESS");
        address feeRouter = vm.envAddress("FEE_ROUTER_ADDRESS");
        vm.startBroadcast();
        factory = new VaultFactory(engine, feeRouter);
        registry = new MandateRegistry();
        vm.stopBroadcast();
        console.log("VaultFactory", address(factory));
        console.log("MandateRegistry", address(registry));
    }
}
