// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {ProtectionFund} from "../src/settlement/ProtectionFund.sol";
import {FeeRouter} from "../src/settlement/FeeRouter.sol";
import {VaultFactory} from "../src/vault/VaultFactory.sol";
import {HyperEvmCctp} from "../src/cctp/HyperEvmCctp.sol";

/// @notice Deploys the FeeRouter (#17) and a VaultFactory whose Vaults it can collect Epoch fees from.
/// ENGINE_ADDRESS = Execution Engine operator (settles Epochs). TREASURY_ADDRESS = the protocol's share of fees.
/// AGENT_REGISTRY_ADDRESS, PROTECTION_FUND_ADDRESS = the #12 / #15 deployments.
/// forge script script/DeployEpoch.s.sol --rpc-url hyperevm_testnet --broadcast --private-key <engine operator>
contract DeployEpoch is Script {
    function run() external returns (FeeRouter router, VaultFactory factory) {
        address engine = vm.envAddress("ENGINE_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        AgentRegistry registry = AgentRegistry(vm.envAddress("AGENT_REGISTRY_ADDRESS"));
        ProtectionFund fund = ProtectionFund(vm.envAddress("PROTECTION_FUND_ADDRESS"));
        vm.startBroadcast();
        router = new FeeRouter(IERC20(HyperEvmCctp.USDC), engine, registry, fund, treasury);
        factory = new VaultFactory(engine, address(router));
        vm.stopBroadcast();
        console.log("FeeRouter", address(router));
        console.log("VaultFactory", address(factory));
    }
}
