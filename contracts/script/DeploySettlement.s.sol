// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {ProtectionFund} from "../src/settlement/ProtectionFund.sol";
import {HyperEvmCctp} from "../src/cctp/HyperEvmCctp.sol";

/// @notice Deploys the AgentRegistry (Bonds, #12) and the ProtectionFund (#15) to HyperEVM testnet, in HyperEVM USDC.
/// The registry names the fund as its slasher, so the fund is deployed right after it at the predicted address.
/// ENGINE_ADDRESS = Execution Engine operator: reports Lead Agents, Epoch values and exposure, and submits claims.
/// forge script script/DeploySettlement.s.sol --rpc-url hyperevm_testnet --broadcast --private-key <engine operator>
contract DeploySettlement is Script {
    function run() external returns (AgentRegistry registry, ProtectionFund fund) {
        address engine = vm.envAddress("ENGINE_ADDRESS");
        address deployer = msg.sender;
        vm.startBroadcast();
        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        registry = new AgentRegistry(IERC20(HyperEvmCctp.USDC), engine, predicted);
        fund = new ProtectionFund(IERC20(HyperEvmCctp.USDC), engine, registry);
        vm.stopBroadcast();
        require(address(fund) == predicted, "fund address mismatch");
        console.log("AgentRegistry", address(registry));
        console.log("ProtectionFund", address(fund));
    }
}
