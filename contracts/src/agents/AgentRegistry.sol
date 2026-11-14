// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @notice Specialist Agents and their Bonds (#12). A Builder registers an agent, stakes a USDC Bond, tops it up at any
/// time, and can start Unbonding only while the agent leads no Vault; the Bond is withdrawable 3 days later and stays
/// slashable until then. The Execution Engine reports which agent leads each Vault and the Vault's value, which sets the
/// Bond Minimum (5% of the combined value of the Vaults the agent leads). Only the engine and the Overshoot settlement
/// contract (`slasher`, the ProtectionFund, #15) may slash.
/// Agents are keyed by the engine's agent id string, as in the DecisionLog.
contract AgentRegistry {
    uint256 public constant UNBONDING_DELAY = 3 days;
    /// @notice Bond Minimum as a share of the combined value of the Vaults an agent leads.
    uint256 public constant BOND_MINIMUM_BPS = 500;

    /// @notice Regime bits for `Agent.regimes`.
    uint8 public constant REGIME_TREND = 1;
    uint8 public constant REGIME_CHOP = 2;
    uint8 public constant REGIME_HIGH_VOLATILITY = 4;
    uint8 public constant REGIME_FUNDING_SKEW = 8;

    struct Agent {
        address builder;
        /// @notice Declared Regimes, as REGIME_* bits.
        uint8 regimes;
        /// @notice USDC, 6 decimals.
        uint256 bond;
        /// @notice When the Bond becomes withdrawable; 0 = not Unbonding.
        uint64 unbondingEndsAt;
        uint32 ledVaults;
        /// @notice Combined value (USDC, 6 decimals) of the Vaults this agent leads, as last reported.
        uint256 ledValue;
    }

    struct Lead {
        bytes32 agent;
        uint256 value;
    }

    IERC20 public immutable usdc;
    /// @notice The Execution Engine operator: reports Lead Agents and slashes.
    address public immutable engine;
    /// @notice The Overshoot settlement contract (ProtectionFund, #15): slashes Bonds first in the waterfall.
    address public immutable slasher;

    mapping(bytes32 agentKey => Agent) internal _agents;
    mapping(address vault => Lead) internal _leads;

    event AgentRegistered(string agentId, address indexed builder, uint8 regimes);
    event BondToppedUp(string agentId, uint256 amount, uint256 bond);
    event UnbondingStarted(string agentId, uint256 bond, uint64 endsAt);
    event BondWithdrawn(string agentId, address indexed builder, uint256 amount);
    event BondSlashed(string agentId, uint256 requested, uint256 slashed, address indexed to, uint256 bond);
    event LeadReported(address indexed vault, string agentId, uint256 vaultValue);

    error NotEngine();
    error NotSlasher();
    error NotBuilder();
    error UnknownAgent();
    error AgentExists();
    error EmptyAgentId();
    error NoRegimes();
    error ZeroAmount();
    error LeadsVaults();
    error AlreadyUnbonding();
    error NotUnbonding();
    error UnbondingNotOver(uint64 endsAt);
    error Unbonding();
    error TransferFailed();

    constructor(IERC20 usdc_, address engine_, address slasher_) {
        usdc = usdc_;
        engine = engine_;
        slasher = slasher_;
    }

    // --- Builder ---

    /// @notice Registers `agentId` with the caller as its Builder, and stakes `bond` USDC (pre-approved).
    function register(string calldata agentId, uint8 regimes, uint256 bond) external {
        if (bytes(agentId).length == 0) revert EmptyAgentId();
        if (regimes == 0) revert NoRegimes();
        Agent storage a = _agents[_key(agentId)];
        if (a.builder != address(0)) revert AgentExists();
        a.builder = msg.sender;
        a.regimes = regimes;
        emit AgentRegistered(agentId, msg.sender, regimes);
        if (bond > 0) _topUp(agentId, a, bond);
    }

    /// @notice Adds `amount` USDC (pre-approved) to the Bond. Allowed at any time, also during Unbonding.
    function topUp(string calldata agentId, uint256 amount) external {
        Agent storage a = _builderAgent(agentId);
        if (amount == 0) revert ZeroAmount();
        _topUp(agentId, a, amount);
    }

    /// @notice Starts the 3-day Unbonding. Only while the agent leads no Vault.
    function startUnbonding(string calldata agentId) external {
        Agent storage a = _builderAgent(agentId);
        if (a.unbondingEndsAt != 0) revert AlreadyUnbonding();
        if (a.ledVaults != 0) revert LeadsVaults();
        if (a.bond == 0) revert ZeroAmount();
        a.unbondingEndsAt = uint64(block.timestamp + UNBONDING_DELAY);
        emit UnbondingStarted(agentId, a.bond, a.unbondingEndsAt);
    }

    /// @notice Pays the whole Bond (less anything slashed meanwhile) to the Builder once Unbonding is over.
    function withdrawBond(string calldata agentId) external returns (uint256 amount) {
        Agent storage a = _builderAgent(agentId);
        if (a.unbondingEndsAt == 0) revert NotUnbonding();
        if (block.timestamp < a.unbondingEndsAt) revert UnbondingNotOver(a.unbondingEndsAt);
        amount = a.bond;
        a.bond = 0;
        a.unbondingEndsAt = 0;
        if (amount > 0 && !usdc.transfer(msg.sender, amount)) revert TransferFailed();
        emit BondWithdrawn(agentId, msg.sender, amount);
    }

    // --- Execution Engine ---

    /// @notice Records `agentId` as the Lead Agent of `vault` (empty = none) and the Vault's value (USDC, 6 decimals).
    /// Called on every Lead Agent switch and whenever the Vault's value is refreshed.
    function reportLead(address vault, string calldata agentId, uint256 vaultValue) external {
        _onlyEngine();
        Lead storage l = _leads[vault];
        if (l.agent != bytes32(0)) {
            Agent storage prev = _agents[l.agent];
            prev.ledVaults -= 1;
            prev.ledValue -= l.value;
        }
        if (bytes(agentId).length == 0) {
            delete _leads[vault];
        } else {
            bytes32 k = _key(agentId);
            Agent storage next = _agents[k];
            if (next.builder == address(0)) revert UnknownAgent();
            if (next.unbondingEndsAt != 0) revert Unbonding();
            next.ledVaults += 1;
            next.ledValue += vaultValue;
            l.agent = k;
            l.value = vaultValue;
        }
        emit LeadReported(vault, agentId, vaultValue);
    }

    /// @notice Slashes up to `amount` USDC from the Bond to `to`, and returns what was actually slashed (the Bond may
    /// be smaller). Unbonding Bonds stay slashable.
    function slash(string calldata agentId, uint256 amount, address to) external returns (uint256 slashed) {
        if (msg.sender != engine && msg.sender != slasher) revert NotSlasher();
        Agent storage a = _agent(agentId);
        slashed = amount < a.bond ? amount : a.bond;
        a.bond -= slashed;
        if (slashed > 0 && !usdc.transfer(to, slashed)) revert TransferFailed();
        emit BondSlashed(agentId, amount, slashed, to, a.bond);
    }

    // --- Views ---

    function agent(string calldata agentId) external view returns (Agent memory) {
        return _agents[_key(agentId)];
    }

    function leadOf(address vault) external view returns (bytes32 agentKey, uint256 vaultValue) {
        Lead storage l = _leads[vault];
        return (l.agent, l.value);
    }

    /// @notice 5% of the combined value of the Vaults the agent leads, rounded up.
    function bondMinimum(string calldata agentId) public view returns (uint256) {
        return _bondMinimum(_agents[_key(agentId)]);
    }

    /// @notice Whether the agent may open positions and be assigned Vaults: registered, holding a Bond, not Unbonding,
    /// and at or above its Bond Minimum.
    function meetsBondMinimum(string calldata agentId) external view returns (bool) {
        Agent storage a = _agents[_key(agentId)];
        return a.builder != address(0) && a.unbondingEndsAt == 0 && a.bond > 0 && a.bond >= _bondMinimum(a);
    }

    // --- internal ---

    function _topUp(string calldata agentId, Agent storage a, uint256 amount) internal {
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        a.bond += amount;
        emit BondToppedUp(agentId, amount, a.bond);
    }

    function _bondMinimum(Agent storage a) internal view returns (uint256) {
        return (a.ledValue * BOND_MINIMUM_BPS + 9_999) / 10_000;
    }

    function _agent(string calldata agentId) internal view returns (Agent storage a) {
        a = _agents[_key(agentId)];
        if (a.builder == address(0)) revert UnknownAgent();
    }

    function _builderAgent(string calldata agentId) internal view returns (Agent storage a) {
        a = _agent(agentId);
        if (a.builder != msg.sender) revert NotBuilder();
    }

    function _onlyEngine() internal view {
        if (msg.sender != engine) revert NotEngine();
    }

    function _key(string calldata agentId) internal pure returns (bytes32) {
        return keccak256(bytes(agentId));
    }
}
