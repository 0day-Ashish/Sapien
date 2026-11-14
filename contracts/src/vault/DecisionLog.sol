// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Append-only Decision Commitments (ADR-0003: enforced in the engine, provable onchain).
/// The Execution Engine commits the hash of every decision record before it sends the order, so a decision
/// can't be rewritten once its outcome is known. A replay recomputes the hash and checks it against this log.
contract DecisionLog {
    struct DecisionCommitment {
        address vault;
        /// @notice The Lead Agent that proposed the trade (the engine's agent id).
        string agentId;
        /// @notice sha256 of the canonical JSON decision record.
        bytes32 decisionHash;
        uint64 timestamp;
    }

    /// @notice The Execution Engine operator, the only writer.
    address public immutable engine;

    DecisionCommitment[] internal _commitments;
    /// @notice 1-based position of a decision hash in the log (0 = never committed).
    mapping(bytes32 decisionHash => uint256) public positionOf;

    event DecisionCommitted(
        uint256 indexed index, address indexed vault, bytes32 indexed decisionHash, string agentId, uint64 timestamp
    );

    error NotEngine();
    error AlreadyCommitted(bytes32 decisionHash);
    error ZeroHash();

    constructor(address engine_) {
        engine = engine_;
    }

    /// @return index 0-based index of the new commitment.
    function commit(address vault, string calldata agentId, bytes32 decisionHash) external returns (uint256 index) {
        if (msg.sender != engine) revert NotEngine();
        if (decisionHash == bytes32(0)) revert ZeroHash();
        if (positionOf[decisionHash] != 0) revert AlreadyCommitted(decisionHash);

        index = _commitments.length;
        uint64 ts = uint64(block.timestamp);
        _commitments.push(DecisionCommitment(vault, agentId, decisionHash, ts));
        positionOf[decisionHash] = index + 1;
        emit DecisionCommitted(index, vault, decisionHash, agentId, ts);
    }

    function count() external view returns (uint256) {
        return _commitments.length;
    }

    function commitmentAt(uint256 index) external view returns (DecisionCommitment memory) {
        return _commitments[index];
    }

    /// @notice What a replay checks: was this decision committed, and when.
    function isCommitted(bytes32 decisionHash) external view returns (bool committed, uint64 timestamp) {
        uint256 pos = positionOf[decisionHash];
        if (pos == 0) return (false, 0);
        return (true, _commitments[pos - 1].timestamp);
    }
}
