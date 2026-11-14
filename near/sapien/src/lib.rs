//! Sapien on NEAR: the user side of an Agentic Perps Vault.
//!
//! A user's NEAR account owns their Vault here. Money in and out moves as USDC on NEAR; trading happens on the
//! Vault on HyperCore, run by the Execution Engine. This contract is the control plane both sides share:
//! - deposits (`ft_on_transfer`) and withdrawals (`request_withdraw` / `pay_withdraw`), each an event the engine acts on;
//! - the Mandate hash the user signed, the Kill Switch, and every Decision Commitment, readable by anyone;
//! - the Specialist Agents' NEAR accounts, which the engine pays their Builder fee share to.
//!
//! The engine signs with a function-call key limited to this contract, so it can log and pay through these
//! methods but cannot move the contract's USDC any other way.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, log, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Vaults,
    Withdrawals,
    Decisions,
    Agents,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct VaultRecord {
    /// The Vault contract on HyperEVM (0x, lowercase).
    pub evm_vault: String,
    /// sha256 of the Mandate the user signed, hex.
    pub mandate_hash: Option<String>,
    /// Kill Switch: while true the engine opens nothing and flattens the Vault.
    pub killed: bool,
    /// USDC subunits deposited and paid out over the Vault's life.
    pub deposited: U128,
    pub withdrawn: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum WithdrawalStatus {
    Requested,
    Paying,
    Paid,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Withdrawal {
    pub account: AccountId,
    /// USDC subunits the user asked for.
    pub requested: U128,
    /// USDC subunits paid (set by the engine from what left the Vault).
    pub paid: U128,
    pub status: WithdrawalStatus,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct DecisionCommitment {
    pub account: AccountId,
    pub agent_id: String,
    /// keccak/sha256 of the decision payload the engine logged, hex. Replay recomputes and compares.
    pub hash: String,
    pub block_timestamp_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Sapien {
    owner: AccountId,
    engine: AccountId,
    usdc: AccountId,
    vaults: LookupMap<AccountId, VaultRecord>,
    withdrawals: LookupMap<u64, Withdrawal>,
    decisions: LookupMap<u64, DecisionCommitment>,
    agents: IterableMap<String, AccountId>,
    next_deposit: u64,
    next_withdrawal: u64,
    next_decision: u64,
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    log!("EVENT_JSON:{}", json!({ "standard": "sapien", "version": "1.0.0", "event": event, "data": [data] }));
}

fn is_hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| b.is_ascii_hexdigit())
}

#[near]
impl Sapien {
    #[init]
    pub fn new(owner: AccountId, engine: AccountId, usdc: AccountId) -> Self {
        Self {
            owner,
            engine,
            usdc,
            vaults: LookupMap::new(StorageKey::Vaults),
            withdrawals: LookupMap::new(StorageKey::Withdrawals),
            decisions: LookupMap::new(StorageKey::Decisions),
            agents: IterableMap::new(StorageKey::Agents),
            next_deposit: 0,
            next_withdrawal: 0,
            next_decision: 0,
        }
    }

    // ---- admin ----

    pub fn set_engine(&mut self, engine: AccountId) {
        self.only_owner();
        self.engine = engine;
    }

    /// Names a Specialist Agent's NEAR account (e.g. `momentum.agents.sapien.testnet`), where its fee share lands.
    pub fn register_agent(&mut self, agent_id: String, account: AccountId) {
        self.only_owner();
        require!(!agent_id.is_empty() && agent_id.len() <= 64, "agent_id: 1-64 chars");
        self.agents.insert(agent_id.clone(), account.clone());
        emit("agent_registered", json!({ "agent_id": agent_id, "account": account }));
    }

    // ---- engine ----

    /// Binds a NEAR account to the Vault the engine created for it on HyperEVM. Once only.
    pub fn register_vault(&mut self, account: AccountId, evm_vault: String) {
        self.only_engine();
        let evm_vault = evm_vault.to_lowercase();
        require!(evm_vault.starts_with("0x") && is_hex(&evm_vault[2..], 40), "evm_vault: 0x + 40 hex");
        require!(!self.vaults.contains_key(&account), "account already has a Vault");
        self.vaults.insert(
            account.clone(),
            VaultRecord { evm_vault: evm_vault.clone(), mandate_hash: None, killed: false, deposited: U128(0), withdrawn: U128(0) },
        );
        emit("vault_registered", json!({ "account": account, "evm_vault": evm_vault }));
    }

    /// Pays a withdrawal: `amount` is what actually left the Vault on HyperCore (it can differ from the request
    /// after PnL). Marked Paying first, so a second call can't pay twice; a failed transfer puts it back.
    pub fn pay_withdraw(&mut self, id: u64, amount: U128) -> Promise {
        self.only_engine();
        let mut w = self.withdrawals.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such withdrawal"));
        require!(w.status == WithdrawalStatus::Requested, "withdrawal not in Requested");
        require!(amount.0 > 0, "amount must be > 0");
        w.status = WithdrawalStatus::Paying;
        w.paid = amount;
        self.withdrawals.insert(id, w.clone());
        Promise::new(self.usdc.clone())
            .function_call(
                "ft_transfer",
                json!({ "receiver_id": w.account, "amount": amount, "memo": format!("sapien withdrawal {id}") }).to_string().into_bytes(),
                ONE_YOCTO,
                GAS_FT_TRANSFER,
            )
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_withdraw_paid(id))
    }

    #[private]
    pub fn on_withdraw_paid(&mut self, id: u64, #[callback_result] result: Result<(), PromiseError>) -> bool {
        let mut w = self.withdrawals.get(&id).cloned().expect("withdrawal");
        if result.is_ok() {
            w.status = WithdrawalStatus::Paid;
            if let Some(v) = self.vaults.get_mut(&w.account) {
                v.withdrawn = U128(v.withdrawn.0 + w.paid.0);
            }
            emit("withdrawal_paid", json!({ "id": id, "account": w.account, "amount": w.paid }));
        } else {
            w.status = WithdrawalStatus::Requested;
            w.paid = U128(0);
            emit("withdrawal_failed", json!({ "id": id, "account": w.account }));
        }
        let ok = w.status == WithdrawalStatus::Paid;
        self.withdrawals.insert(id, w);
        ok
    }

    /// Records a Decision Commitment for a Vault. Returns its id.
    pub fn log_decision(&mut self, account: AccountId, agent_id: String, hash: String) -> u64 {
        self.only_engine();
        require!(self.vaults.contains_key(&account), "account has no Vault");
        let hash = hash.trim_start_matches("0x").to_lowercase();
        require!(is_hex(&hash, 64), "hash: 32 bytes hex");
        let id = self.next_decision;
        self.next_decision += 1;
        let block_timestamp_ms = env::block_timestamp_ms();
        self.decisions.insert(id, DecisionCommitment { account: account.clone(), agent_id: agent_id.clone(), hash: hash.clone(), block_timestamp_ms });
        emit("decision", json!({ "id": id, "account": account, "agent_id": agent_id, "hash": hash }));
        id
    }

    /// Pays a Specialist Agent its fee share in USDC from the contract.
    pub fn pay_agent(&mut self, agent_id: String, amount: U128, memo: Option<String>) -> Promise {
        self.only_engine();
        let account = self.agents.get(&agent_id).cloned().unwrap_or_else(|| env::panic_str("unknown agent"));
        require!(amount.0 > 0, "amount must be > 0");
        emit("agent_paid", json!({ "agent_id": agent_id, "account": account, "amount": amount, "memo": memo }));
        Promise::new(self.usdc.clone()).function_call(
            "ft_transfer",
            json!({ "receiver_id": account, "amount": amount, "memo": memo }).to_string().into_bytes(),
            ONE_YOCTO,
            GAS_FT_TRANSFER,
        )
    }

    // ---- user ----

    /// NEP-141 receiver: a deposit of test USDC into the sender's Vault. Refunds (returns the full amount) if the
    /// token isn't our USDC's or the sender has no Vault yet.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let _ = msg;
        if env::predecessor_account_id() != self.usdc {
            return PromiseOrValue::Value(amount);
        }
        let Some(v) = self.vaults.get_mut(&sender_id) else {
            return PromiseOrValue::Value(amount);
        };
        v.deposited = U128(v.deposited.0 + amount.0);
        let evm_vault = v.evm_vault.clone();
        let id = self.next_deposit;
        self.next_deposit += 1;
        emit("deposit", json!({ "id": id, "account": sender_id, "evm_vault": evm_vault, "amount": amount }));
        PromiseOrValue::Value(U128(0))
    }

    /// Asks for `amount` USDC back. The engine withdraws it from the Vault (once Flat) and calls `pay_withdraw`.
    pub fn request_withdraw(&mut self, amount: U128) -> u64 {
        let account = env::predecessor_account_id();
        require!(self.vaults.contains_key(&account), "no Vault");
        require!(amount.0 > 0, "amount must be > 0");
        let id = self.next_withdrawal;
        self.next_withdrawal += 1;
        self.withdrawals.insert(id, Withdrawal { account: account.clone(), requested: amount, paid: U128(0), status: WithdrawalStatus::Requested });
        emit("withdrawal_requested", json!({ "id": id, "account": account, "amount": amount }));
        id
    }

    /// Records the hash of the Mandate the user signed (each new Mandate Version replaces it).
    pub fn commit_mandate(&mut self, mandate_hash: String) {
        let account = env::predecessor_account_id();
        let hash = mandate_hash.trim_start_matches("0x").to_lowercase();
        require!(is_hex(&hash, 64), "mandate_hash: 32 bytes hex");
        let v = self.vaults.get_mut(&account).unwrap_or_else(|| env::panic_str("no Vault"));
        v.mandate_hash = Some(hash.clone());
        emit("mandate_committed", json!({ "account": account, "mandate_hash": hash }));
    }

    /// Kill Switch: `true` stops the engine opening anything and flattens the Vault; `false` lets it trade again.
    pub fn set_killed(&mut self, killed: bool) {
        let account = env::predecessor_account_id();
        let v = self.vaults.get_mut(&account).unwrap_or_else(|| env::panic_str("no Vault"));
        v.killed = killed;
        emit("kill_switch", json!({ "account": account, "killed": killed }));
    }

    // ---- views ----

    pub fn vault_of(&self, account: AccountId) -> Option<VaultRecord> {
        self.vaults.get(&account).cloned()
    }

    pub fn withdrawal(&self, id: u64) -> Option<Withdrawal> {
        self.withdrawals.get(&id).cloned()
    }

    pub fn decision(&self, id: u64) -> Option<DecisionCommitment> {
        self.decisions.get(&id).cloned()
    }

    pub fn agents(&self) -> Vec<(String, AccountId)> {
        self.agents.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }

    pub fn config(&self) -> near_sdk::serde_json::Value {
        json!({
            "owner": self.owner, "engine": self.engine, "usdc": self.usdc,
            "deposits": self.next_deposit, "withdrawals": self.next_withdrawal, "decisions": self.next_decision,
        })
    }

    // ---- guards ----

    fn only_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
    }

    fn only_engine(&self) {
        require!(env::predecessor_account_id() == self.engine, "engine only");
    }
}

#[cfg(test)]
mod tests;
