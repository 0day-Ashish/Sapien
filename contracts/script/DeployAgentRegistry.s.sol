// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {HyperEvmCctp} from "../src/cctp/HyperEvmCctp.sol";

/// @notice Deploys the AgentRegistry (Bonds, #12) to HyperEVM testnet, bonded in HyperEVM USDC.
/// ENGINE_ADDRESS = Execution Engine operator, the only account that may report Lead Agents and slash.
/// forge script script/DeployAgentRegistry.s.sol --rpc-url hyperevm_testnet --broadcast --account <keystore>
contract DeployAgentRegistry is Script {
    function run() external returns (AgentRegistry registry) {
        address engine = vm.envAddress("ENGINE_ADDRESS");
        vm.startBroadcast();
        registry = new AgentRegistry(IERC20(HyperEvmCctp.USDC), engine);
        vm.stopBroadcast();
        console.log("AgentRegistry", address(registry));
    }
}
