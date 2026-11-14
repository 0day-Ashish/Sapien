use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult, RuntimeFeesConfig};

const VAULT: &str = "0x00000000000000000000000000000000000000aa";
const HASH: &str = "ab00000000000000000000000000000000000000000000000000000000000001";

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn as_(caller: &str) {
    testing_env!(VMContextBuilder::new().current_account_id(acc("sapien.testnet")).predecessor_account_id(acc(caller)).build());
}

fn setup() -> Sapien {
    as_("owner.testnet");
    let mut c = Sapien::new(acc("owner.testnet"), acc("engine.testnet"), acc("usdc.testnet"));
    as_("engine.testnet");
    c.register_vault(acc("alice.testnet"), VAULT.to_uppercase().replace("0X", "0x"));
    c
}

#[test]
fn register_vault_binds_once() {
    let c = setup();
    assert_eq!(c.vault_of(acc("alice.testnet")).unwrap().evm_vault, VAULT);
    assert!(get_logs()[0].contains("\"vault_registered\""));
}

#[test]
#[should_panic(expected = "already has a Vault")]
fn register_vault_twice_panics() {
    let mut c = setup();
    c.register_vault(acc("alice.testnet"), VAULT.into());
}

#[test]
#[should_panic(expected = "engine only")]
fn register_vault_engine_only() {
    let mut c = setup();
    as_("alice.testnet");
    c.register_vault(acc("bob.testnet"), VAULT.into());
}

#[test]
fn deposit_from_usdc_credits_vault_and_emits() {
    let mut c = setup();
    as_("usdc.testnet");
    let r = c.ft_on_transfer(acc("alice.testnet"), U128(2_000_000), "".into());
    assert!(matches!(r, PromiseOrValue::Value(U128(0))));
    assert_eq!(c.vault_of(acc("alice.testnet")).unwrap().deposited, U128(2_000_000));
    let log = &get_logs()[0];
    assert!(log.contains("\"deposit\"") && log.contains(VAULT) && log.contains("2000000"), "{log}");
}

#[test]
fn deposit_refunds_wrong_token_or_no_vault() {
    let mut c = setup();
    as_("fake.testnet");
    assert!(matches!(c.ft_on_transfer(acc("alice.testnet"), U128(5), "".into()), PromiseOrValue::Value(U128(5))));
    as_("usdc.testnet");
    assert!(matches!(c.ft_on_transfer(acc("bob.testnet"), U128(7), "".into()), PromiseOrValue::Value(U128(7))));
    assert_eq!(c.vault_of(acc("alice.testnet")).unwrap().deposited, U128(0));
}

#[test]
fn withdraw_request_pay_and_callback() {
    let mut c = setup();
    as_("alice.testnet");
    let id = c.request_withdraw(U128(1_000_000));
    as_("engine.testnet");
    let _ = c.pay_withdraw(id, U128(900_000));
    assert_eq!(c.withdrawal(id).unwrap().status, WithdrawalStatus::Paying);

    testing_env!(
        VMContextBuilder::new().current_account_id(acc("sapien.testnet")).predecessor_account_id(acc("sapien.testnet")).build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])]
    );
    assert!(c.on_withdraw_paid(id, Ok(())));
    let w = c.withdrawal(id).unwrap();
    assert_eq!((w.status, w.paid), (WithdrawalStatus::Paid, U128(900_000)));
    assert_eq!(c.vault_of(acc("alice.testnet")).unwrap().withdrawn, U128(900_000));
}

#[test]
fn failed_payout_returns_to_requested() {
    let mut c = setup();
    as_("alice.testnet");
    let id = c.request_withdraw(U128(1_000_000));
    as_("engine.testnet");
    let _ = c.pay_withdraw(id, U128(1_000_000));
    as_("sapien.testnet");
    assert!(!c.on_withdraw_paid(id, Err(PromiseError::Failed)));
    assert_eq!(c.withdrawal(id).unwrap().status, WithdrawalStatus::Requested);
}

#[test]
#[should_panic(expected = "not in Requested")]
fn pay_withdraw_twice_panics() {
    let mut c = setup();
    as_("alice.testnet");
    let id = c.request_withdraw(U128(1));
    as_("engine.testnet");
    let _ = c.pay_withdraw(id, U128(1));
    let _ = c.pay_withdraw(id, U128(1));
}

#[test]
#[should_panic(expected = "engine only")]
fn user_cannot_pay_withdraw() {
    let mut c = setup();
    as_("alice.testnet");
    let id = c.request_withdraw(U128(1));
    let _ = c.pay_withdraw(id, U128(1));
}

#[test]
fn mandate_kill_switch_and_decisions() {
    let mut c = setup();
    as_("alice.testnet");
    c.commit_mandate(format!("0x{HASH}"));
    c.set_killed(true);
    let v = c.vault_of(acc("alice.testnet")).unwrap();
    assert_eq!((v.mandate_hash.as_deref(), v.killed), (Some(HASH), true));

    as_("engine.testnet");
    let id = c.log_decision(acc("alice.testnet"), "momentum".into(), HASH.into());
    assert_eq!(c.decision(id).unwrap().hash, HASH);
    assert_eq!(c.config()["decisions"], 1);
}

#[test]
#[should_panic(expected = "no Vault")]
fn kill_switch_needs_vault() {
    let mut c = setup();
    as_("bob.testnet");
    c.set_killed(true);
}

#[test]
fn agents_register_and_pay() {
    let mut c = setup();
    as_("owner.testnet");
    c.register_agent("momentum".into(), acc("momentum.agents.sapien.testnet"));
    assert_eq!(c.agents(), vec![("momentum".to_string(), acc("momentum.agents.sapien.testnet"))]);
    as_("engine.testnet");
    let _ = c.pay_agent("momentum".into(), U128(120_000), Some("epoch 7".into()));
    assert!(get_logs().iter().any(|l| l.contains("\"agent_paid\"")));
}

#[test]
#[should_panic(expected = "owner only")]
fn register_agent_owner_only() {
    let mut c = setup();
    c.register_agent("momentum".into(), acc("x.testnet"));
}
