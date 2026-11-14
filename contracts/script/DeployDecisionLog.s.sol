// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {DecisionLog} from "../src/vault/DecisionLog.sol";

/// @notice Deploys the DecisionLog to HyperEVM testnet. Separate from Deploy.s.sol so an existing
/// VaultFactory/MandateRegistry deployment stays as is.
/// ENGINE_ADDRESS = Execution Engine operator, the only account that may commit decisions.
/// forge script script/DeployDecisionLog.s.sol --rpc-url hyperevm_testnet --broadcast --account <keystore>
contract DeployDecisionLog is Script {
    function run() external returns (DecisionLog decisionLog) {
        address engine = vm.envAddress("ENGINE_ADDRESS");
        vm.startBroadcast();
        decisionLog = new DecisionLog(engine);
        vm.stopBroadcast();
        console.log("DecisionLog", address(decisionLog));
    }
}
