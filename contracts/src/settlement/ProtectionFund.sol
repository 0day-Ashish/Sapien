// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../agents/AgentRegistry.sol";

/// @notice Overshoot settlement (#15, ADR-0002). Holds the Protection Fund (seed + premiums) and the Protocol Reserve,
/// and runs the waterfall for each Overshoot claim the Execution Engine submits:
///   - Infrastructure Failure (no resting stop-loss on HyperCore when the trigger was crossed): the Protocol Reserve
///     pays; anything it can't cover falls to the Protection Fund. The Bond is never touched.
///   - Otherwise (a market gap): the Lead Agent's Bond is slashed first, then the Protection Fund pays.
///   - The Protection Fund pays each Vault at most 10% of its value at the start of the Epoch, per Epoch, and pays the
///     claims of one settlement pro-rata when it can't cover them all. What's left is unpaid; nothing is clawed back.
/// Overshoot = |fill - trigger| x size, computed here from the claim (prices and size with 8 decimals, USDC with 6).
/// Payouts go to the Vault's HyperEVM address, from where its owner can withdraw them (Vault.bridgeOut).
/// Always "stop-loss protected", never "guaranteed".
contract ProtectionFund {
    /// @notice Per-Vault Protection Fund cap per Epoch, as a share of the Vault's value at Epoch start.
    uint256 public constant VAULT_CAP_BPS = 1_000;
    uint256 public constant EPOCH_LENGTH = 1 days;
    /// @notice Price and size scale in claims (1e8 = 1.0); 1e8 x 1e8 / 1e10 = USDC with 6 decimals.
    uint256 public constant PRICE_SCALE = 1e8;

    struct Claim {
        address vault;
        /// @notice The Lead Agent whose stop-loss filled past its trigger.
        string agentId;
        /// @notice One claim per position: the stop-loss order's cloid.
        bytes32 positionId;
        uint256 triggerPriceE8;
        uint256 fillPriceE8;
        /// @notice The stop's filled size.
        uint256 sizeE8;
        bool infrastructureFailure;
        /// @notice keccak256 of the evidence JSON (order ids, fills, timestamps); the JSON itself is at `evidenceRef`.
        bytes32 evidenceHash;
        string evidenceRef;
    }

    struct Settlement {
        address vault;
        string agentId;
        uint64 epoch;
        uint64 settledAt;
        bool infrastructureFailure;
        uint256 triggerPriceE8;
        uint256 fillPriceE8;
        uint256 sizeE8;
        /// @notice USDC, 6 decimals.
        uint256 overshoot;
        uint256 fromReserve;
        uint256 fromBond;
        uint256 fromFund;
        bytes32 evidenceHash;
        string evidenceRef;
    }

    IERC20 public immutable usdc;
    address public immutable engine;
    AgentRegistry public immutable registry;
    /// @notice Start of Epoch 0.
    uint64 public immutable genesis;

    /// @notice Protection Fund balance (seed + premiums - payouts), USDC.
    uint256 public fundBalance;
    /// @notice Protocol Reserve balance, USDC.
    uint256 public reserveBalance;
    /// @notice Total open stop-loss exposure across Vaults (USDC), as last reported by the engine.
    uint256 public openExposure;

    mapping(address vault => mapping(uint256 epoch => uint256)) public epochStartValue;
    mapping(address vault => mapping(uint256 epoch => uint256)) public fundPaidInEpoch;
    mapping(bytes32 positionId => Settlement) internal _settlements;
    bytes32[] internal _claimIds;

    event FundDeposited(address indexed from, uint256 amount, uint256 fundBalance);
    event ReserveDeposited(address indexed from, uint256 amount, uint256 reserveBalance);
    event EpochValueReported(address indexed vault, uint256 indexed epoch, uint256 value);
    event ExposureReported(uint256 openExposure);
    event OvershootSettled(
        bytes32 indexed positionId,
        address indexed vault,
        string agentId,
        uint256 overshoot,
        uint256 fromReserve,
        uint256 fromBond,
        uint256 fromFund,
        bool infrastructureFailure,
        bytes32 evidenceHash,
        string evidenceRef
    );

    error NotEngine();
    error ZeroAmount();
    error AlreadySettled(bytes32 positionId);
    error NoOvershoot(bytes32 positionId);
    error ZeroVault();
    error TransferFailed();

    constructor(IERC20 usdc_, address engine_, AgentRegistry registry_) {
        usdc = usdc_;
        engine = engine_;
        registry = registry_;
        genesis = uint64(block.timestamp);
    }

    // --- Funding (anyone) ---

    /// @notice Adds USDC (pre-approved) to the Protection Fund: the seed, and premiums (#17).
    function depositToFund(uint256 amount) external {
        _pull(amount);
        fundBalance += amount;
        emit FundDeposited(msg.sender, amount, fundBalance);
    }

    /// @notice Adds USDC (pre-approved) to the Protocol Reserve.
    function depositToReserve(uint256 amount) external {
        _pull(amount);
        reserveBalance += amount;
        emit ReserveDeposited(msg.sender, amount, reserveBalance);
    }

    // --- Execution Engine ---

    /// @notice The Vault's value (USDC) at the start of the current Epoch: sets its Protection Fund cap.
    function reportEpochValue(address vault, uint256 value) external {
        _onlyEngine();
        uint256 epoch = currentEpoch();
        epochStartValue[vault][epoch] = value;
        emit EpochValueReported(vault, epoch, value);
    }

    /// @notice Total open stop-loss exposure (USDC) across Vaults, for the Coverage Ratio.
    function reportExposure(uint256 exposure) external {
        _onlyEngine();
        openExposure = exposure;
        emit ExposureReported(exposure);
    }

    /// @notice Settles Overshoot claims. Protection Fund shares are pro-rata across this batch when it's short.
    function settle(Claim[] calldata claims) external {
        _onlyEngine();
        uint256 epoch = currentEpoch();
        uint256[] memory asks = new uint256[](claims.length);
        uint256 totalAsk;

        // 1. Reserve or Bond first, then what each claim asks of the Fund (within its Vault's Epoch cap).
        for (uint256 i; i < claims.length; i++) {
            Claim calldata c = claims[i];
            if (c.vault == address(0)) revert ZeroVault();
            if (_settlements[c.positionId].vault != address(0)) revert AlreadySettled(c.positionId);
            uint256 overshoot = overshootOf(c.triggerPriceE8, c.fillPriceE8, c.sizeE8);
            if (overshoot == 0) revert NoOvershoot(c.positionId);

            Settlement storage s = _record(c, epoch, overshoot);
            uint256 remaining = overshoot;
            if (c.infrastructureFailure) {
                s.fromReserve = _min(remaining, reserveBalance);
                reserveBalance -= s.fromReserve;
                remaining -= s.fromReserve;
                _pay(c.vault, s.fromReserve);
            } else {
                s.fromBond = registry.slash(c.agentId, remaining, c.vault);
                remaining -= s.fromBond;
            }

            uint256 cap = epochStartValue[c.vault][epoch] * VAULT_CAP_BPS / 10_000;
            uint256 used = fundPaidInEpoch[c.vault][epoch];
            asks[i] = _min(remaining, cap > used ? cap - used : 0);
            fundPaidInEpoch[c.vault][epoch] = used + asks[i]; // reserved; trimmed below if pro-rata
            totalAsk += asks[i];
        }

        // 2. The Protection Fund pays every ask in full, or pro-rata if it can't.
        uint256 available = fundBalance;
        for (uint256 i; i < claims.length; i++) {
            Claim calldata c = claims[i];
            uint256 paid = totalAsk <= available ? asks[i] : asks[i] * available / totalAsk;
            fundPaidInEpoch[c.vault][epoch] -= asks[i] - paid;
            fundBalance -= paid;
            Settlement storage s = _settlements[c.positionId];
            s.fromFund = paid;
            _pay(c.vault, paid);
            emit OvershootSettled(
                c.positionId, c.vault, c.agentId, s.overshoot, s.fromReserve, s.fromBond, paid, c.infrastructureFailure, c.evidenceHash, c.evidenceRef
            );
        }
    }

    // --- Views ---

    /// @notice USDC (6 decimals) lost beyond an exit exactly at the trigger: |fill - trigger| x size. Fees and funding excluded.
    function overshootOf(uint256 triggerPriceE8, uint256 fillPriceE8, uint256 sizeE8) public pure returns (uint256) {
        uint256 diff = fillPriceE8 > triggerPriceE8 ? fillPriceE8 - triggerPriceE8 : triggerPriceE8 - fillPriceE8;
        return diff * sizeE8 / (PRICE_SCALE * PRICE_SCALE / 1e6);
    }

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - genesis) / EPOCH_LENGTH;
    }

    /// @notice Protection Fund balance / open stop-loss exposure, in bps. type(uint256).max with no exposure.
    function coverageRatioBps() external view returns (uint256) {
        return openExposure == 0 ? type(uint256).max : fundBalance * 10_000 / openExposure;
    }

    function settlement(bytes32 positionId) external view returns (Settlement memory) {
        return _settlements[positionId];
    }

    /// @notice Every settled claim's position id, oldest first.
    function claimIds() external view returns (bytes32[] memory) {
        return _claimIds;
    }

    // --- internal ---

    function _record(Claim calldata c, uint256 epoch, uint256 overshoot) internal returns (Settlement storage s) {
        s = _settlements[c.positionId];
        s.vault = c.vault;
        s.agentId = c.agentId;
        s.epoch = uint64(epoch);
        s.settledAt = uint64(block.timestamp);
        s.infrastructureFailure = c.infrastructureFailure;
        s.triggerPriceE8 = c.triggerPriceE8;
        s.fillPriceE8 = c.fillPriceE8;
        s.sizeE8 = c.sizeE8;
        s.overshoot = overshoot;
        s.evidenceHash = c.evidenceHash;
        s.evidenceRef = c.evidenceRef;
        _claimIds.push(c.positionId);
    }

    function _pull(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    function _pay(address to, uint256 amount) internal {
        if (amount > 0 && !usdc.transfer(to, amount)) revert TransferFailed();
    }

    function _onlyEngine() internal view {
        if (msg.sender != engine) revert NotEngine();
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
