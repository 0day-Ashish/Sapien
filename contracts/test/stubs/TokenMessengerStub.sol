// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestUsdc} from "./TestUsdc.sol";

/// @notice Records CCTP V2 burns and pulls the burned USDC, like TokenMessengerV2.
contract TokenMessengerStub {
    struct Burn {
        address from;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bytes hookData;
    }

    Burn[] internal _burns;

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external {
        TestUsdc(burnToken).transferFrom(msg.sender, address(this), amount);
        _burns.push(
            Burn(
                msg.sender,
                amount,
                destinationDomain,
                mintRecipient,
                burnToken,
                destinationCaller,
                maxFee,
                minFinalityThreshold,
                hookData
            )
        );
    }

    function burnCount() external view returns (uint256) {
        return _burns.length;
    }

    function burnAt(uint256 i) external view returns (Burn memory) {
        return _burns[i];
    }
}
