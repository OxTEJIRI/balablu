use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

// Real reply from NEAR AI Cloud (Qwen/Qwen3.8-27B in a TEE), captured 2026-11-09.
const REQ: &[u8] = include_bytes!("../fixtures/qwen.request.json");
const RESP: &[u8] = include_bytes!("../fixtures/qwen.response.json");
const MODEL: &str = "Qwen/Qwen3.8-27B";
const PK: &str = "89154a43a47684742c3d1753252bb6f49f61da9d8c84fc9b1def2df130cb2d93";
const SIG: &str = "2001c1a753206586099bb28b589cbbdc92e631c106fa3030034dc85bdec9d0909b293fb5833aeb1c65b8644b118ed6bc8333287199ecd970f48cf981fdfd5908";

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    acc("owner.testnet")
}
fn usdc() -> AccountId {
    acc("usdc.testnet")
}
fn ada() -> AccountId {
    acc("ada.testnet")
}
fn kemi() -> AccountId {
    acc("kemi.testnet")
}

fn call_as(who: AccountId, yocto: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("balablu.testnet"))
        .predecessor_account_id(who)
        .attached_deposit(NearToken::from_yoctonear(yocto));
    testing_env!(b.build());
}

fn setup(cap_usdc: u128) -> BalaBlu {
    call_as(owner(), 0);
    let mut c = BalaBlu::new(owner(), usdc(), U128(cap_usdc));
    c.register_jury_key(MODEL.into(), PK.into());
    c
}

fn deposit(c: &mut BalaBlu, who: AccountId, amount: u128) {
    call_as(usdc(), 0);
    let _ = c.ft_on_transfer(who, U128(amount), String::new());
}

fn new_claim(c: &mut BalaBlu, odds: u32, seed: u128) -> u64 {
    call_as(owner(), 0);
    c.create_claim(
        "NEAR Protocol".into(),
        "NEAR moved to community control in October 2020.".into(),
        "FACT if validators took over in October 2020.".into(),
        vec!["https://near.org/blog".into()],
        odds,
        U128(seed),
    )
}

fn usdc_of(c: &BalaBlu, who: AccountId) -> u128 {
    c.get_wallet(who).usdc.0
}

fn check(c: &BalaBlu, req: &[u8], resp: &[u8], pk: &str, sig: &str) -> ReplyCheck {
    c.check_ai_reply(req.to_vec().into(), resp.to_vec().into(), pk.into(), sig.into())
}

// ---------------- jury signature checks (Day 1) ----------------

#[test]
fn real_enclave_signature_verifies() {
    let c = setup(0);
    let r = check(&c, REQ, RESP, PK, SIG);
    assert!(r.valid, "{}", r.reason);
    assert_eq!(r.model.as_deref(), Some(MODEL));
    assert_eq!(r.binding.as_deref(), Some("BALABLU-AUDIT:test:abc"));
}

#[test]
fn edited_response_is_rejected() {
    let c = setup(0);
    let edited = String::from_utf8(RESP.to_vec()).unwrap().replace("TRUE", "FALSE");
    let r = check(&c, REQ, edited.as_bytes(), PK, SIG);
    assert!(!r.valid);
    assert_eq!(r.reason, "signature does not match");
}

#[test]
fn edited_request_is_rejected() {
    let c = setup(0);
    let edited = String::from_utf8(REQ.to_vec()).unwrap().replace("test:abc", "test:xyz");
    assert!(!check(&c, edited.as_bytes(), RESP, PK, SIG).valid);
}

#[test]
fn forged_signature_is_rejected() {
    let c = setup(0);
    let mut forged = SIG.to_string();
    forged.replace_range(0..2, "21");
    assert!(!check(&c, REQ, RESP, PK, &forged).valid);
}

#[test]
fn unregistered_or_removed_key_is_rejected() {
    let mut c = setup(0);
    c.remove_jury_key(PK.into());
    assert_eq!(check(&c, REQ, RESP, PK, SIG).reason, "unregistered key");
}

#[test]
fn key_registered_for_other_model_is_rejected() {
    let mut c = setup(0);
    c.register_jury_key("z-ai/glm-5.3-flash".into(), PK.into());
    assert!(!check(&c, REQ, RESP, PK, SIG).valid);
}

#[test]
fn malformed_inputs_do_not_panic() {
    let c = setup(0);
    assert_eq!(check(&c, REQ, RESP, "zz", SIG).reason, "bad public key");
    assert_eq!(check(&c, REQ, RESP, PK, "abcd").reason, "bad signature encoding");
}

#[test]
#[should_panic(expected = "only owner")]
fn only_owner_registers_keys() {
    let mut c = setup(0);
    call_as(ada(), 0);
    c.register_jury_key(MODEL.into(), PK.into());
}

#[test]
fn binding_parser() {
    assert_eq!(find_binding(b"x BALABLU-AUDIT:42:ab12. y").as_deref(), Some("BALABLU-AUDIT:42:ab12"));
    assert_eq!(find_binding(b"BALABLU-AUDIT:42"), None);
    assert_eq!(find_binding(b"nothing here"), None);
}

// ---------------- money in / out ----------------

#[test]
fn practice_points_once() {
    let mut c = setup(0);
    call_as(ada(), 0);
    assert_eq!(c.claim_practice_points().0, 1_000 * ONE);
    assert!(c.get_wallet(ada()).got_points);
}

#[test]
#[should_panic(expected = "already claimed")]
fn practice_points_cannot_be_claimed_twice() {
    let mut c = setup(0);
    call_as(ada(), 0);
    c.claim_practice_points();
    c.claim_practice_points();
}

#[test]
fn usdc_deposit_lands_in_wallet() {
    let mut c = setup(0);
    deposit(&mut c, ada(), 7 * ONE);
    assert_eq!(usdc_of(&c, ada()), 7 * ONE);
}

#[test]
#[should_panic(expected = "only USDC")]
fn fake_token_deposit_is_rejected() {
    let mut c = setup(0);
    call_as(acc("fakeusdc.testnet"), 0);
    let _ = c.ft_on_transfer(ada(), U128(1_000 * ONE), String::new());
}

#[test]
fn withdraw_debits_wallet() {
    let mut c = setup(0);
    deposit(&mut c, ada(), 5 * ONE);
    call_as(ada(), 1);
    let _ = c.withdraw_usdc(U128(2 * ONE));
    assert_eq!(usdc_of(&c, ada()), 3 * ONE);
}

#[test]
#[should_panic(expected = "not enough USDC")]
fn withdraw_more_than_balance_fails() {
    let mut c = setup(0);
    deposit(&mut c, ada(), ONE);
    call_as(ada(), 1);
    let _ = c.withdraw_usdc(U128(2 * ONE));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_needs_one_yocto() {
    let mut c = setup(0);
    deposit(&mut c, ada(), ONE);
    call_as(ada(), 0);
    let _ = c.withdraw_usdc(U128(ONE));
}

// ---------------- claims and bets ----------------

#[test]
#[should_panic(expected = "only owner")]
fn only_owner_creates_claims() {
    let mut c = setup(0);
    call_as(ada(), 0);
    c.create_claim("p".into(), "t".into(), "r".into(), vec![], 5_000, U128(0));
}

#[test]
fn new_claim_starts_at_requested_odds() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 8_400, 0);
    let m = c.get_market(id, Currency::Points, None).unwrap();
    assert!((m.fact_odds_bps as i64 - 8_400).abs() <= 1);
    assert_eq!(m.status, MarketStatus::Open);
    assert!(c.get_market(id, Currency::Usdc, None).is_none(), "no USDC market without a seed");
}

#[test]
fn quote_matches_buy_and_moves_odds() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(ada(), 0);
    c.claim_practice_points();
    let q = c.quote_buy(id, Side::Fact, Currency::Points, U128(200 * ONE)).unwrap();
    let got = c.buy(id, Side::Fact, Currency::Points, U128(200 * ONE), Some(q.shares));
    assert_eq!(got.0, q.shares.0);
    assert!(got.0 > 200 * ONE, "a 50/50 bet must pay more than the stake");
    let m = c.get_market(id, Currency::Points, None).unwrap();
    assert!(m.fact_odds_bps > 5_000);
    assert_eq!(c.get_wallet(ada()).points.0, 800 * ONE);
}

#[test]
#[should_panic(expected = "odds moved")]
fn slippage_guard_works() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(ada(), 0);
    c.claim_practice_points();
    c.buy(id, Side::Fact, Currency::Points, U128(100 * ONE), Some(U128(1_000 * ONE)));
}

#[test]
#[should_panic(expected = "per-bet cap")]
fn usdc_bet_cap_is_enforced() {
    let mut c = setup(2 * ONE);
    deposit(&mut c, owner(), 10 * ONE);
    let id = new_claim(&mut c, 5_000, 5 * ONE);
    deposit(&mut c, ada(), 10 * ONE);
    call_as(ada(), 0);
    c.buy(id, Side::Fact, Currency::Usdc, U128(3 * ONE), None);
}

#[test]
#[should_panic(expected = "not enough balance")]
fn cannot_bet_without_balance() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(ada(), 0);
    c.buy(id, Side::Fact, Currency::Points, U128(ONE), None);
}

#[test]
#[should_panic(expected = "paused")]
fn no_betting_while_paused() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(owner(), 0);
    c.set_paused(id, true);
    call_as(ada(), 0);
    c.claim_practice_points();
    c.buy(id, Side::Fact, Currency::Points, U128(ONE), None);
}

#[test]
fn sell_returns_less_than_cost() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 3_000, 0);
    call_as(ada(), 0);
    c.claim_practice_points();
    let shares = c.buy(id, Side::Balablu, Currency::Points, U128(100 * ONE), None);
    let back = c.sell(id, Side::Balablu, Currency::Points, shares, None);
    assert!(back.0 < 100 * ONE);
    assert_eq!(c.get_position(ada(), id, 0, Currency::Points).balablu.0, 0);
}

#[test]
#[should_panic(expected = "not enough shares")]
fn cannot_sell_shares_you_do_not_have() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(kemi(), 0);
    c.sell(id, Side::Fact, Currency::Points, U128(ONE), None);
}

// ---------------- settlement ----------------

#[test]
fn winners_paid_losers_not_and_next_epoch_opens() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(ada(), 0);
    c.claim_practice_points();
    let ada_shares = c.buy(id, Side::Balablu, Currency::Points, U128(200 * ONE), None);
    call_as(kemi(), 0);
    c.claim_practice_points();
    c.buy(id, Side::Fact, Currency::Points, U128(100 * ONE), None);

    call_as(owner(), 0);
    assert_eq!(c.settle_epoch(id, Outcome::Balablu), 1);

    call_as(ada(), 0);
    assert_eq!(c.redeem(id, 0, Currency::Points).0, ada_shares.0);
    assert_eq!(c.get_wallet(ada()).points.0, 800 * ONE + ada_shares.0);
    call_as(kemi(), 0);
    assert_eq!(c.redeem(id, 0, Currency::Points).0, 0);

    // perpetual: epoch 1 is open near the verdict (10% FACT)
    assert_eq!(c.get_claim(id).unwrap().epoch, 1);
    let m = c.get_market(id, Currency::Points, None).unwrap();
    assert_eq!(m.status, MarketStatus::Open);
    assert!((m.fact_odds_bps as i64 - 1_000).abs() <= 1);
    // new bets go to the new epoch
    call_as(kemi(), 0);
    c.buy(id, Side::Fact, Currency::Points, U128(ONE), None);
    assert!(c.get_position(kemi(), id, 1, Currency::Points).fact.0 > 0);
}

#[test]
#[should_panic(expected = "nothing to redeem")]
fn double_redeem_fails() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(ada(), 0);
    c.claim_practice_points();
    c.buy(id, Side::Fact, Currency::Points, U128(ONE), None);
    call_as(owner(), 0);
    c.settle_epoch(id, Outcome::Fact);
    call_as(ada(), 0);
    c.redeem(id, 0, Currency::Points);
    c.redeem(id, 0, Currency::Points);
}

#[test]
#[should_panic(expected = "not settled")]
fn cannot_redeem_before_settlement() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(ada(), 0);
    c.claim_practice_points();
    c.buy(id, Side::Fact, Currency::Points, U128(ONE), None);
    c.redeem(id, 0, Currency::Points);
}

#[test]
#[should_panic(expected = "only owner")]
fn only_owner_settles_for_now() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 0);
    call_as(ada(), 0);
    c.settle_epoch(id, Outcome::Fact);
}

#[test]
fn unresolvable_refunds_at_last_odds() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 7_000, 0);
    call_as(ada(), 0);
    c.claim_practice_points();
    let s = c.buy(id, Side::Fact, Currency::Points, U128(100 * ONE), None);
    let odds = c.get_market(id, Currency::Points, None).unwrap().fact_odds_bps as u128;
    call_as(owner(), 0);
    c.settle_epoch(id, Outcome::Unresolvable);
    call_as(ada(), 0);
    let got = c.redeem(id, 0, Currency::Points).0;
    assert_eq!(got, s.0 * odds / BPS);
}

#[test]
fn usdc_money_is_conserved() {
    // Every USDC unit that comes in is either in someone's wallet or held for
    // a live market. After settlement and redemption nothing is lost or made.
    let mut c = setup(2 * ONE);
    deposit(&mut c, owner(), 10 * ONE);
    let id = new_claim(&mut c, 6_000, 5 * ONE);
    deposit(&mut c, ada(), 10 * ONE);
    deposit(&mut c, kemi(), 10 * ONE);
    let total_in = 30 * ONE;

    for i in 0..40u128 {
        let (who, side) = if i % 2 == 0 { (ada(), Side::Fact) } else { (kemi(), Side::Balablu) };
        call_as(who.clone(), 0);
        let amt = (i * 37_123) % (2 * ONE) + ONE / 100;
        if usdc_of(&c, who.clone()) >= amt {
            let s = c.buy(id, side, Currency::Usdc, U128(amt), None);
            if i % 7 == 0 {
                c.sell(id, side, Currency::Usdc, U128(s.0 / 3), None);
            }
        }
    }
    let held = c.get_market(id, Currency::Usdc, None).unwrap().collateral.0;
    let wallets = usdc_of(&c, owner()) + usdc_of(&c, ada()) + usdc_of(&c, kemi());
    assert_eq!(wallets + held, total_in, "before settlement");

    call_as(owner(), 0);
    c.settle_epoch(id, Outcome::Fact);
    for who in [owner(), ada(), kemi()] {
        call_as(who, 0);
        c.redeem(id, 0, Currency::Usdc);
    }
    let wallets = usdc_of(&c, owner()) + usdc_of(&c, ada()) + usdc_of(&c, kemi());
    assert_eq!(wallets, total_in, "after everyone redeemed");
}

#[test]
fn usdc_market_needs_owner_funds() {
    let mut c = setup(0);
    let id = new_claim(&mut c, 5_000, 5 * ONE);
    assert!(c.get_market(id, Currency::Usdc, None).is_none());
    deposit(&mut c, owner(), 5 * ONE);
    let id2 = new_claim(&mut c, 5_000, 5 * ONE);
    assert!(c.get_market(id2, Currency::Usdc, None).is_some());
    assert_eq!(usdc_of(&c, owner()), 0);
}
