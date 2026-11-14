// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {CORE_WRITER, ICoreWriter} from "../../src/hypercore/ICoreWriter.sol";

/// @notice Test stand-in for CoreWriter. Records every action so tests can assert on what was written.
contract CoreWriterStub is ICoreWriter {
    struct Action {
        address sender;
        bytes data;
    }

    Action[] internal _actions;

    function sendRawAction(bytes calldata data) external {
        _actions.push(Action(msg.sender, data));
        emit RawAction(msg.sender, data);
    }

    function actionCount() external view returns (uint256) {
        return _actions.length;
    }

    function actionAt(uint256 i) external view returns (address sender, bytes memory data) {
        Action storage a = _actions[i];
        return (a.sender, a.data);
    }
}

/// @dev Free function so tests can call `installCoreWriterStub(vm)`.
function installCoreWriterStub(Vm vm) returns (CoreWriterStub) {
    vm.etch(CORE_WRITER, address(new CoreWriterStub()).code);
    return CoreWriterStub(CORE_WRITER);
}
