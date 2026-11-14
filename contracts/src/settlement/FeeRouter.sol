// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AgentRegistry} from "../agents/AgentRegistry.sol";
import {Vault} from "../vault/Vault.sol";
import {ProtectionFund} from "./ProtectionFund.sol";

/// @notice Epoch settlement (#17). Once per Epoch the Execution Engine reports each Vault's value; the FeeRouter applies
/// the High-Water Mark and charges, on profit above it only:
///   - 12% performance fee to the Lead Agent's Builder,
///   - 3% to the protocol, of which 25% tops up the Protection Fund and the rest goes to the treasury,
///   - 3% profit premium to the Protection Fund;
/// plus, from every Vault, the base premium: the Epoch's premium rate x the notional it traded, to the Protection Fund.
/// The premium rate (`k x leverage x volatility / stop-loss distance`) is recalibrated by the engine each Epoch; its
/// risk tier is derived here so the UI and the engine agree.
///
/// Money: a Vault's USDC sits on HyperCore. `settleEpoch` asks the Vault to move what it owes to its HyperEVM address
/// (`Vault.collectFees`); HyperCore applies that a block later, then `distribute` pulls it (`Vault.payFees`) and pays the
/// charges oldest first. A collection HyperCore drops (margin in use) is asked for again next Epoch.
///
/// High-Water Mark: set to the Vault's value at its first settlement, then raised to each new high. `netFlows` (deposits
/// minus withdrawals on HyperCore since the last settlement, as the engine reads them from the ledger) shift it, so
/// money moving in or out is never profit or loss. Fee collections count as outflows too.
contract FeeRouter {
    uint256 internal constant BPS = 10_000;
    uint256 public constant BUILDER_FEE_BPS = 1_200;
    uint256 public constant PROTOCOL_FEE_BPS = 300;
    uint256 public constant PROFIT_PREMIUM_BPS = 300;
    /// @notice Share of the protocol fee that tops up the Protection Fund.
    uint256 public constant PROTOCOL_TO_FUND_BPS = 2_500;
    /// @notice Premium rates are in parts per million of notional (100 ppm = 1 bp).
    uint256 public constant RATE_SCALE = 1e6;
    /// @notice Tier cut-offs: Low below 3 bps, Medium below 8 bps, High from 8 bps.
    uint32 public constant LOW_TIER_BELOW_PPM = 300;
    uint32 public constant MEDIUM_TIER_BELOW_PPM = 800;
    /// @notice Smallest amount worth collecting from HyperCore (each collection costs ~0.0245 USDC there).
    uint256 public constant MIN_COLLECTION = 100_000;

    enum Tier {
        Low,
        Medium,
        High
    }

    struct EpochReport {
        uint64 epoch;
        uint64 settledAt;
        /// @notice USDC, 6 decimals, like every amount here.
        uint256 value;
        /// @notice The High-Water Mark this Epoch was measured against (after flows).
        uint256 highWaterMark;
        uint256 profit;
        uint256 builderFee;
        uint256 protocolFee;
        uint256 profitPremium;
        uint256 basePremium;
        uint256 notional;
        uint32 premiumRatePpm;
        string agentId;
        address builder;
    }

    struct Due {
        address builder;
        uint256 builderAmount;
        uint256 treasuryAmount;
        uint256 fundAmount;
    }

    IERC20 public immutable usdc;
    address public immutable engine;
    AgentRegistry public immutable registry;
    ProtectionFund public immutable fund;
    address public immutable treasury;

    mapping(address vault => uint256) public highWaterMark;
    /// @notice Charged but not yet paid out, USDC.
    mapping(address vault => uint256) public owed;
    /// @notice Pulled from the Vault but not yet enough to pay its oldest charge.
    mapping(address vault => uint256) public received;
    mapping(address vault => EpochReport) internal _latest;
    mapping(address vault => Due[]) internal _dues;
    mapping(address vault => uint256) public dueHead;

    event EpochSettled(
        address indexed vault,
        uint256 indexed epoch,
        uint256 value,
        uint256 highWaterMark,
        uint256 profit,
        uint256 basePremium,
        uint32 premiumRatePpm,
        Tier tier
    );
    event FeesCollectionRequested(address indexed vault, uint256 amount);
    event FeesDistributed(
        address indexed vault, address indexed builder, uint256 toBuilder, uint256 toTreasury, uint256 toFund
    );

    error NotEngine();
    error EpochAlreadySettled(address vault, uint256 epoch);
    error TransferFailed();

    constructor(IERC20 usdc_, address engine_, AgentRegistry registry_, ProtectionFund fund_, address treasury_) {
        usdc = usdc_;
        engine = engine_;
        registry = registry_;
        fund = fund_;
        treasury = treasury_;
    }

    /// @notice Settles one Vault's Epoch: High-Water Mark, profit split, base premium, premium rate. Engine only.
    /// @param netFlows Deposits minus withdrawals (USDC) on the Vault's HyperCore account since its last settlement.
    /// @param agentId The Lead Agent this Epoch. With none, or one the AgentRegistry doesn't know, the Builder share goes
    /// to the treasury.
    /// @param notional USDC notional the Vault traded this Epoch: the base premium's basis.
    function settleEpoch(
        address vault,
        uint64 epoch,
        uint256 value,
        int256 netFlows,
        string calldata agentId,
        uint32 premiumRatePpm,
        uint256 notional
    ) external {
        if (msg.sender != engine) revert NotEngine();
        EpochReport storage r = _latest[vault];
        if (r.settledAt != 0 && epoch <= r.epoch) revert EpochAlreadySettled(vault, epoch);
        _measure(vault, r, value, netFlows);
        r.epoch = epoch;
        r.settledAt = uint64(block.timestamp);
        r.value = value;
        r.notional = notional;
        r.premiumRatePpm = premiumRatePpm;
        r.agentId = agentId;
        address builder = bytes(agentId).length == 0 ? address(0) : registry.agent(agentId).builder;
        r.builder = builder == address(0) ? treasury : builder;
        Due memory d = _charge(r);
        emit EpochSettled(
            vault, epoch, value, r.highWaterMark, r.profit, r.basePremium, premiumRatePpm, tierOf(premiumRatePpm)
        );

        uint256 total = d.builderAmount + d.treasuryAmount + d.fundAmount;
        if (total > 0) {
            _dues[vault].push(d);
            owed[vault] += total;
        }
        _collect(vault);
    }

    /// @notice Pulls the fee USDC that has reached the Vault's HyperEVM address and pays its charges, oldest first.
    /// Anyone may call it. Old Vaults without `payFees` pay nothing.
    function distribute(address vault) external returns (uint256 got) {
        try Vault(vault).payFees() returns (uint256 paid) {
            got = paid;
        } catch {}
        uint256 buffer = received[vault] + got;
        Due[] storage dues = _dues[vault];
        uint256 head = dueHead[vault];
        while (head < dues.length) {
            Due memory d = dues[head];
            uint256 total = d.builderAmount + d.treasuryAmount + d.fundAmount;
            if (buffer < total) break;
            buffer -= total;
            owed[vault] -= total;
            delete dues[head];
            head++;
            _transfer(d.builder, d.builderAmount);
            _transfer(treasury, d.treasuryAmount);
            if (d.fundAmount > 0) {
                usdc.approve(address(fund), d.fundAmount);
                fund.depositToFund(d.fundAmount);
            }
            emit FeesDistributed(vault, d.builder, d.builderAmount, d.treasuryAmount, d.fundAmount);
        }
        dueHead[vault] = head;
        received[vault] = buffer;
    }

    // --- Views ---

    function tierOf(uint32 premiumRatePpm) public pure returns (Tier) {
        if (premiumRatePpm < LOW_TIER_BELOW_PPM) return Tier.Low;
        if (premiumRatePpm < MEDIUM_TIER_BELOW_PPM) return Tier.Medium;
        return Tier.High;
    }

    /// @notice The Vault's latest Epoch settlement (settledAt = 0 if never settled).
    function latest(address vault) external view returns (EpochReport memory) {
        return _latest[vault];
    }

    function tier(address vault) external view returns (Tier) {
        return tierOf(_latest[vault].premiumRatePpm);
    }

    /// @notice Charges not yet paid out, oldest first.
    function dues(address vault) external view returns (Due[] memory out) {
        Due[] storage all = _dues[vault];
        uint256 head = dueHead[vault];
        out = new Due[](all.length - head);
        for (uint256 i; i < out.length; i++) {
            out[i] = all[head + i];
        }
    }

    // --- internal ---

    /// @dev High-Water Mark (shifted by flows) and the profit above it. The first settlement only sets the mark.
    function _measure(address vault, EpochReport storage r, uint256 value, int256 netFlows) internal {
        uint256 hwm = value;
        uint256 profit;
        if (r.settledAt != 0) {
            int256 shifted = int256(highWaterMark[vault]) + netFlows;
            hwm = shifted > 0 ? uint256(shifted) : 0;
            if (value > hwm) profit = value - hwm;
        }
        highWaterMark[vault] = value > hwm ? value : hwm;
        r.highWaterMark = hwm;
        r.profit = profit;
    }

    /// @dev The profit split and the base premium (capped at what the Vault has left), as one charge.
    function _charge(EpochReport storage r) internal returns (Due memory d) {
        uint256 profit = r.profit;
        r.builderFee = profit * BUILDER_FEE_BPS / BPS;
        r.protocolFee = profit * PROTOCOL_FEE_BPS / BPS;
        r.profitPremium = profit * PROFIT_PREMIUM_BPS / BPS;
        uint256 left = r.value - r.builderFee - r.protocolFee - r.profitPremium;
        uint256 basePremium = r.notional * r.premiumRatePpm / RATE_SCALE;
        r.basePremium = basePremium < left ? basePremium : left;
        uint256 protocolToFund = r.protocolFee * PROTOCOL_TO_FUND_BPS / BPS;
        d = Due(
            r.builder, r.builderFee, r.protocolFee - protocolToFund, protocolToFund + r.profitPremium + r.basePremium
        );
    }

    /// @dev Asks the Vault for what it still owes. Silently skipped for old Vaults without `collectFees`.
    function _collect(address vault) internal {
        uint256 outstanding = owed[vault] - received[vault];
        if (outstanding < MIN_COLLECTION) return;
        try Vault(vault).collectFees(uint64(outstanding)) {
            emit FeesCollectionRequested(vault, outstanding);
        } catch {}
    }

    function _transfer(address to, uint256 amount) internal {
        if (amount > 0 && !usdc.transfer(to, amount)) revert TransferFailed();
    }
}
