//! BalaBlu contract — the encyclopedia where every fact has odds.
//!
//! * Claims: short checkable sentences, each with a rule for FACT / BALABLU,
//!   plus evidence quotes stored on-chain.
//! * Markets: one binary FPMM per claim, per epoch, per currency (free
//!   practice points, or USDC). Perpetual: after each verdict a new epoch
//!   opens near the verdict.
//! * Audits: surprise (keeper + on-chain randomness) or requested (fee).
//!   Betting pauses. The contract writes the jury question itself; anyone can
//!   submit the jury's signed replies, and the contract verifies every
//!   enclave signature, the exact question, and the verdicts before paying.
//! * Appeals: bond -> 5-model panel -> council window -> final.
//! * Pages: AI-written page versions are anchored (signed reply hashes).

pub mod fpmm;
pub mod jury;
#[cfg(test)]
mod tests;

use fpmm::{Pool, BPS};
use jury::{SignedReply, Verdict, GATEWAY};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

/// 1 USDC / 1 practice point (both use 6 decimals).
pub const ONE: u128 = 1_000_000;
pub const MAX_EVIDENCE: usize = 8;
/// Attached NEAR to add evidence (pays its storage, deters spam).
pub const EVIDENCE_DEPOSIT: NearToken = NearToken::from_millinear(10);

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    // order matters: JuryKeys must stay first (existing testnet state)
    JuryKeys,
    Claims,
    Markets,
    Positions,
    Wallets,
    Evidence,
    Audits,
    Pages,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Currency {
    Points,
    Usdc,
}

impl Currency {
    fn tag(self) -> u8 {
        match self {
            Currency::Points => 0,
            Currency::Usdc => 1,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Fact,
    Balablu,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarketStatus {
    Open,
    /// Trading paused while the jury works.
    Paused,
    Resolved,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Fact,
    Balablu,
    /// Jury split or not enough evidence: refund at the last odds.
    Unresolvable,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Claim {
    pub id: u64,
    pub page: String,
    pub text: String,
    /// How the jury decides FACT vs BALABLU.
    pub rule: String,
    pub sources: Vec<String>,
    pub creator: AccountId,
    /// Current (open) epoch.
    pub epoch: u32,
    pub created_at_ms: u64,
    pub evidence: Vec<u64>,
    pub active_audit: Option<u64>,
    pub last_roll_ms: u64,
    pub audits: Vec<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Evidence {
    pub id: u64,
    pub claim_id: u64,
    pub by: AccountId,
    pub url: String,
    pub quote: String,
    pub added_ms: u64,
    /// How many jury rounds read it (evidence rewards build on this).
    pub uses: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditKind {
    Surprise,
    Requested,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditStatus {
    /// Round 1: waiting for the 3-model jury.
    AwaitingJury,
    /// Verdict in; anyone may appeal before the deadline.
    AppealWindow,
    /// Round 2: waiting for the 5-model panel.
    AwaitingPanel,
    /// Panel verdict in; the council may overrule before the deadline.
    CouncilWindow,
    Final,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Vote {
    pub round: u8,
    pub model: String,
    pub verdict: Verdict,
    pub reason: String,
    pub request_sha256: String,
    pub response_sha256: String,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Audit {
    pub id: u64,
    pub claim_id: u64,
    pub epoch: u32,
    pub kind: AuditKind,
    pub requester: Option<AccountId>,
    pub fee: U128,
    pub status: AuditStatus,
    pub round: u8,
    pub evidence_ids: Vec<u64>,
    pub evidence_root: String,
    pub started_ms: u64,
    pub deadline_ms: u64,
    pub first_outcome: Option<Outcome>,
    pub outcome: Option<Outcome>,
    pub votes: Vec<Vote>,
    pub appellant: Option<AccountId>,
    pub bond: U128,
    pub council_overruled: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct PageAnchor {
    pub page: String,
    pub version: u32,
    pub model: String,
    pub request_sha256: String,
    pub response_sha256: String,
    pub anchored_ms: u64,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone)]
pub struct Market {
    pool: Pool,
    /// Complete sets minted = collateral held for this market.
    sets: u128,
    status: MarketStatus,
    /// What one FACT share pays after resolution (BALABLU pays the rest).
    payout_fact_bps: u32,
    volume: u128,
    lp: AccountId,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, Default)]
pub struct Position {
    fact: u128,
    balablu: u128,
    spent: u128,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, Default)]
pub struct Wallet {
    points: u128,
    usdc: u128,
    got_points: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Config {
    pub usdc_token: AccountId,
    /// Max USDC per bet (0 = no cap). Mainnet: 2 USDC.
    pub max_bet_usdc: U128,
    pub fee_bps: u32,
    pub practice_grant: U128,
    pub practice_seed: U128,
    /// USDC the owner puts in when a new epoch opens (0 = practice only).
    pub usdc_seed: U128,
    /// Runs surprise-audit rolls and anchors pages.
    pub keeper: AccountId,
    /// Final say after a panel (a person, a multisig or a Sputnik DAO).
    pub council: AccountId,
    /// Signs practice-point actions for guests (no wallet) and files Ask Blu
    /// claim suggestions (practice markets only). Never touches USDC.
    pub relayer: AccountId,
    /// Round 1 jury models (all must vote).
    pub jury_models: Vec<String>,
    /// Round 2 appeal panel models (all must vote).
    pub panel_models: Vec<String>,
    /// USDC fee to request an audit.
    pub audit_fee: U128,
    /// USDC bond to appeal a verdict.
    pub appeal_bond: U128,
    pub appeal_window_ms: u64,
    pub jury_timeout_ms: u64,
    /// Chance (bps) that a surprise roll starts an audit.
    pub surprise_bps: u32,
    /// Min time between surprise rolls on one claim.
    pub roll_interval_ms: u64,
}

// ---------- JSON views ----------

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq)]
pub struct ReplyCheck {
    pub valid: bool,
    pub model: Option<String>,
    pub binding: Option<String>,
    pub reason: String,
}

#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct JuryPrompt {
    pub audit_id: u64,
    pub round: u8,
    pub models: Vec<String>,
    pub system: String,
    pub user: String,
    pub binding: String,
}

#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct MarketView {
    pub claim_id: u64,
    pub epoch: u32,
    pub currency: Currency,
    pub status: MarketStatus,
    pub fact_odds_bps: u32,
    pub fact_reserve: U128,
    pub balablu_reserve: U128,
    pub collateral: U128,
    pub volume: U128,
    pub payout_fact_bps: u32,
}

#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct PositionView {
    pub fact: U128,
    pub balablu: U128,
    pub spent: U128,
}

#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct WalletView {
    pub points: U128,
    pub usdc: U128,
    pub got_points: bool,
}

#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct Quote {
    pub shares: U128,
    /// What you get if you're right (each share pays 1).
    pub payout_if_right: U128,
    pub fee: U128,
    pub fact_odds_after_bps: u32,
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BalaBlu {
    owner: AccountId,
    /// lowercase hex ed25519 public key -> model id, or GATEWAY
    jury_keys: LookupMap<String, String>,
    config: Config,
    claims: Vector<Claim>,
    markets: LookupMap<(u64, u32, u8), Market>,
    positions: LookupMap<(AccountId, u64, u32, u8), Position>,
    wallets: LookupMap<AccountId, Wallet>,
    evidence: Vector<Evidence>,
    audits: Vector<Audit>,
    pages: LookupMap<String, PageAnchor>,
}

#[near]
impl BalaBlu {
    #[init]
    pub fn new(owner: AccountId, usdc_token: AccountId, max_bet_usdc: U128) -> Self {
        Self::fresh(owner, usdc_token, max_bet_usdc)
    }

    /// Re-initialise over old state (testnet upgrades only; callable only by
    /// the contract account itself).
    #[private]
    #[init(ignore_state)]
    pub fn reinit(owner: AccountId, usdc_token: AccountId, max_bet_usdc: U128) -> Self {
        Self::fresh(owner, usdc_token, max_bet_usdc)
    }

    // ---------- money in / out ----------

    /// One-time grant of free practice points.
    pub fn claim_practice_points(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        self.grant_points(&who)
    }

    // ---------- guests (no wallet): practice points only, signed by the relayer ----------

    pub fn guest_claim_points(&mut self, guest: AccountId) -> U128 {
        self.assert_guest(&guest);
        self.grant_points(&guest)
    }

    pub fn guest_buy(&mut self, guest: AccountId, claim_id: u64, side: Side, amount: U128, min_shares: Option<U128>) -> U128 {
        self.assert_guest(&guest);
        self.do_buy(&guest, claim_id, side, Currency::Points, amount, min_shares)
    }

    pub fn guest_sell(&mut self, guest: AccountId, claim_id: u64, side: Side, shares: U128, min_out: Option<U128>) -> U128 {
        self.assert_guest(&guest);
        self.do_sell(&guest, claim_id, side, Currency::Points, shares, min_out)
    }

    pub fn guest_redeem(&mut self, guest: AccountId, claim_id: u64, epoch: u32) -> U128 {
        self.assert_guest(&guest);
        self.do_redeem(&guest, claim_id, epoch, Currency::Points)
    }
}

impl BalaBlu {
    fn assert_guest(&self, guest: &AccountId) {
        require!(env::predecessor_account_id() == self.config.relayer, "only the relayer acts for guests");
        require!(guest.as_str().ends_with(".guest"), "guest ids end with .guest");
    }

    fn grant_points(&mut self, who: &AccountId) -> U128 {
        let grant = self.config.practice_grant.0;
        let w = self.wallet_mut(who);
        require!(!w.got_points, "practice points already claimed");
        w.got_points = true;
        w.points += grant;
        U128(w.points)
    }
}

#[near]
impl BalaBlu {
    /// NEP-141 receiver: USDC sent with `ft_transfer_call` lands in your
    /// BalaBlu wallet.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.config.usdc_token, "only USDC is accepted");
        let _ = msg;
        self.wallet_mut(&sender_id).usdc += amount.0;
        PromiseOrValue::Value(U128(0))
    }

    /// Cash out USDC from your BalaBlu wallet. Attach exactly 1 yoctoNEAR.
    #[payable]
    pub fn withdraw_usdc(&mut self, amount: U128) -> Promise {
        near_sdk::assert_one_yocto();
        require!(amount.0 > 0, "amount must be positive");
        let who = env::predecessor_account_id();
        let w = self.wallet_mut(&who);
        require!(w.usdc >= amount.0, "not enough USDC");
        w.usdc -= amount.0;
        ext_ft::ext(self.config.usdc_token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(15))
            .ft_transfer(who.clone(), amount, Some("BalaBlu cash out".into()))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).on_withdraw(who, amount))
    }

    #[private]
    pub fn on_withdraw(&mut self, account_id: AccountId, amount: U128) -> bool {
        let ok = near_sdk::is_promise_success();
        if !ok {
            self.wallet_mut(&account_id).usdc += amount.0;
        }
        ok
    }

    // ---------- claims and evidence ----------

    /// Create a claim. Opens a practice market and, if `usdc_seed` > 0, a USDC
    /// market seeded from the owner's wallet. The owner, or the relayer for
    /// Ask Blu suggestions (practice market only, no USDC).
    pub fn create_claim(
        &mut self,
        page: String,
        text: String,
        rule: String,
        sources: Vec<String>,
        fact_odds_bps: u32,
        usdc_seed: U128,
    ) -> u64 {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner || (caller == self.config.relayer && usdc_seed.0 == 0),
            "only owner (or relayer for practice-only claims)"
        );
        require!(rule.len() >= 10, "a claim needs a rule");
        require!(!text.is_empty() && text.len() <= 280, "claim text must be 1-280 chars");
        require!(!page.is_empty() && page.len() <= 80, "page must be 1-80 chars");
        require!(rule.len() <= 600 && sources.len() <= 10, "claim too long");
        let id = self.claims.len() as u64;
        self.claims.push(Claim {
            id,
            page,
            text,
            rule,
            sources,
            creator: env::predecessor_account_id(),
            epoch: 0,
            created_at_ms: env::block_timestamp_ms(),
            evidence: vec![],
            active_audit: None,
            last_roll_ms: 0,
            audits: vec![],
        });
        self.open_markets(id, 0, fact_odds_bps, usdc_seed.0);
        id
    }

    /// Add a source quote the jury will read at the next audit. Attach 0.01 NEAR.
    #[payable]
    pub fn add_evidence(&mut self, claim_id: u64, url: String, quote: String) -> u64 {
        require!(env::attached_deposit() >= EVIDENCE_DEPOSIT, "attach 0.01 NEAR to add evidence");
        require!(url.starts_with("https://") && url.len() <= 300 && !url.contains('\n'), "url must be https and short");
        require!(!quote.trim().is_empty() && quote.chars().count() <= 1_200, "quote must be 1-1200 chars");
        let c = self.claim(claim_id);
        require!(c.active_audit.is_none(), "evidence is frozen during an audit");
        require!(c.evidence.len() < MAX_EVIDENCE, "this claim already has the maximum evidence");
        let id = self.evidence.len() as u64;
        self.evidence.push(Evidence {
            id,
            claim_id,
            by: env::predecessor_account_id(),
            url,
            quote: quote.replace("END EVIDENCE", "END-EVIDENCE"),
            added_ms: env::block_timestamp_ms(),
            uses: 0,
        });
        self.claims.get_mut(claim_id as u32).unwrap().evidence.push(id);
        id
    }

    /// Moderation: drop spam or off-topic evidence (not during an audit).
    pub fn remove_evidence(&mut self, claim_id: u64, evidence_id: u64) {
        self.assert_owner();
        let c = self.claims.get_mut(claim_id as u32).unwrap_or_else(|| env::panic_str("no such claim"));
        require!(c.active_audit.is_none(), "evidence is frozen during an audit");
        c.evidence.retain(|e| *e != evidence_id);
    }

    // ---------- trading ----------

    /// Bet `amount` on a side. Returns shares received (each pays 1 if right).
    pub fn buy(&mut self, claim_id: u64, side: Side, currency: Currency, amount: U128, min_shares: Option<U128>) -> U128 {
        let who = env::predecessor_account_id();
        self.do_buy(&who, claim_id, side, currency, amount, min_shares)
    }

    /// Cash out shares early at the current odds. Returns collateral received.
    pub fn sell(&mut self, claim_id: u64, side: Side, currency: Currency, shares: U128, min_out: Option<U128>) -> U128 {
        let who = env::predecessor_account_id();
        self.do_sell(&who, claim_id, side, currency, shares, min_out)
    }

    /// Collect winnings from a settled epoch.
    pub fn redeem(&mut self, claim_id: u64, epoch: u32, currency: Currency) -> U128 {
        let who = env::predecessor_account_id();
        self.do_redeem(&who, claim_id, epoch, currency)
    }

    fn do_buy(&mut self, who: &AccountId, claim_id: u64, side: Side, currency: Currency, amount: U128, min_shares: Option<U128>) -> U128 {
        let who = who.clone();
        let amount = amount.0;
        require!(amount >= ONE / 100, "minimum bet is 0.01");
        if currency == Currency::Usdc {
            let cap = self.config.max_bet_usdc.0;
            require!(cap == 0 || amount <= cap, "bet is above the per-bet cap");
        }
        self.debit(&who, currency, amount);
        let fee = amount * self.config.fee_bps as u128 / BPS;
        let net = amount - fee;
        if currency == Currency::Usdc && fee > 0 {
            let owner = self.owner.clone();
            self.wallet_mut(&owner).usdc += fee;
        }
        let epoch = self.claim(claim_id).epoch;
        let key = (claim_id, epoch, currency.tag());
        let m = self.markets.get_mut(&key).unwrap_or_else(|| env::panic_str("no market"));
        require!(m.status == MarketStatus::Open, "betting is paused for this claim");
        let shares = m.pool.buy(side == Side::Fact, net);
        m.sets += net;
        m.volume += amount;
        if let Some(min) = min_shares {
            require!(shares >= min.0, "odds moved: fewer shares than expected");
        }
        let pos = self.position_mut(&who, claim_id, epoch, currency);
        match side {
            Side::Fact => pos.fact += shares,
            Side::Balablu => pos.balablu += shares,
        }
        pos.spent += amount;
        U128(shares)
    }

    fn do_sell(&mut self, who: &AccountId, claim_id: u64, side: Side, currency: Currency, shares: U128, min_out: Option<U128>) -> U128 {
        let who = who.clone();
        let shares = shares.0;
        require!(shares > 0, "shares must be positive");
        let epoch = self.claim(claim_id).epoch;
        {
            let pos = self.position_mut(&who, claim_id, epoch, currency);
            let held = match side {
                Side::Fact => &mut pos.fact,
                Side::Balablu => &mut pos.balablu,
            };
            require!(*held >= shares, "not enough shares");
            *held -= shares;
        }
        let key = (claim_id, epoch, currency.tag());
        let m = self.markets.get_mut(&key).unwrap_or_else(|| env::panic_str("no market"));
        require!(m.status == MarketStatus::Open, "betting is paused for this claim");
        let gross = m.pool.sell(side == Side::Fact, shares);
        m.sets -= gross;
        m.volume += gross;
        let fee = gross * self.config.fee_bps as u128 / BPS;
        let out = gross - fee;
        if let Some(min) = min_out {
            require!(out >= min.0, "odds moved: less than expected");
        }
        if currency == Currency::Usdc && fee > 0 {
            let owner = self.owner.clone();
            self.wallet_mut(&owner).usdc += fee;
        }
        self.credit(&who, currency, out);
        U128(out)
    }

    fn do_redeem(&mut self, who: &AccountId, claim_id: u64, epoch: u32, currency: Currency) -> U128 {
        let who = who.clone();
        let key = (claim_id, epoch, currency.tag());
        let bps = {
            let m = self.markets.get(&key).unwrap_or_else(|| env::panic_str("no market"));
            require!(m.status == MarketStatus::Resolved, "not settled yet");
            m.payout_fact_bps as u128
        };
        let pos = self
            .positions
            .remove(&(who.clone(), claim_id, epoch, currency.tag()))
            .unwrap_or_else(|| env::panic_str("nothing to redeem"));
        let payout = (pos.fact * bps + pos.balablu * (BPS - bps)) / BPS;
        self.credit(&who, currency, payout);
        U128(payout)
    }

    // ---------- audits ----------

    /// Anyone can ask the jury to check a claim now (pays the audit fee in USDC).
    pub fn request_audit(&mut self, claim_id: u64) -> u64 {
        let who = env::predecessor_account_id();
        let fee = self.config.audit_fee.0;
        if fee > 0 {
            self.debit(&who, Currency::Usdc, fee);
        }
        self.start_audit(claim_id, AuditKind::Requested, Some(who), fee)
    }

    /// Keeper rolls the dice; with `surprise_bps` chance an audit starts now.
    /// Returns the audit id if one started.
    pub fn surprise_roll(&mut self, claim_id: u64) -> Option<u64> {
        require!(env::predecessor_account_id() == self.config.keeper, "only the keeper rolls");
        let now = env::block_timestamp_ms();
        let interval = self.config.roll_interval_ms;
        let c = self.claim(claim_id);
        if c.active_audit.is_some() || now < c.last_roll_ms + interval {
            return None;
        }
        self.claims.get_mut(claim_id as u32).unwrap().last_roll_ms = now;
        let seed = env::random_seed();
        let roll = u16::from_le_bytes([seed[0], seed[1]]) as u32 % 10_000;
        if roll < self.config.surprise_bps {
            Some(self.start_audit(claim_id, AuditKind::Surprise, None, 0))
        } else {
            None
        }
    }

    /// Submit the jury's signed replies. Anyone can do this: the contract
    /// checks every signature, the exact question and the verdicts itself.
    pub fn submit_votes(&mut self, audit_id: u64, replies: Vec<SignedReply>) -> Outcome {
        let a = self.audit(audit_id).clone();
        let models = match a.status {
            AuditStatus::AwaitingJury => self.config.jury_models.clone(),
            AuditStatus::AwaitingPanel => self.config.panel_models.clone(),
            _ => env::panic_str("this audit is not waiting for votes"),
        };
        let expected = self.jury_prompt(&a).user;
        let mut votes: Vec<Vote> = vec![];
        for r in &replies {
            let key_model = self
                .jury_keys
                .get(&r.public_key_hex.trim().trim_start_matches("0x").to_lowercase())
                .cloned()
                .unwrap_or_else(|| env::panic_str("unregistered enclave key"));
            let checked = jury::verify(r, &key_model).unwrap_or_else(|e| env::panic_str(&e));
            require!(models.contains(&checked.model), "model is not on this round's jury");
            require!(!votes.iter().any(|v| v.model == checked.model), "one vote per model");
            if key_model != GATEWAY {
                let req_model = checked.request.get("model").and_then(|m| m.as_str()).unwrap_or("");
                require!(req_model == checked.model, "request model does not match the key");
            }
            jury::check_jury_request(&checked.request, &expected).unwrap_or_else(|e| env::panic_str(&e));
            let (verdict, reason) = jury::parse_verdict(&checked.response).unwrap_or_else(|e| env::panic_str(&e));
            votes.push(Vote {
                round: a.round,
                model: checked.model,
                verdict,
                reason,
                request_sha256: checked.request_sha256,
                response_sha256: checked.response_sha256,
            });
        }
        require!(votes.len() == models.len(), "every model on the jury must vote");
        self.apply_round(audit_id, votes)
    }

    /// Disagree with the jury? Post the bond (USDC) to send it to the 5-model panel.
    pub fn appeal(&mut self, audit_id: u64) {
        let who = env::predecessor_account_id();
        let a = self.audit(audit_id).clone();
        require!(a.status == AuditStatus::AppealWindow, "this audit cannot be appealed now");
        require!(env::block_timestamp_ms() < a.deadline_ms, "the appeal window has closed");
        let bond = self.config.appeal_bond.0;
        self.debit(&who, Currency::Usdc, bond);
        let timeout = self.config.jury_timeout_ms;
        let a = self.audits.get_mut(audit_id as u32).unwrap();
        a.status = AuditStatus::AwaitingPanel;
        a.round = 2;
        a.appellant = Some(who);
        a.bond = U128(bond);
        a.deadline_ms = env::block_timestamp_ms() + timeout;
    }

    /// Council's final say after a panel verdict (during the council window).
    pub fn council_decide(&mut self, audit_id: u64, outcome: Outcome) {
        require!(env::predecessor_account_id() == self.config.council, "only the council");
        let a = self.audit(audit_id);
        require!(a.status == AuditStatus::CouncilWindow, "no panel verdict to review");
        require!(env::block_timestamp_ms() < a.deadline_ms, "the council window has closed");
        let a = self.audits.get_mut(audit_id as u32).unwrap();
        if a.outcome != Some(outcome) {
            a.council_overruled = true;
        }
        a.outcome = Some(outcome);
        self.finalize_audit(audit_id);
    }

    /// After the window closes with no appeal (or no council action), anyone
    /// can finalize: winners get paid and a new epoch opens.
    pub fn finalize(&mut self, audit_id: u64) {
        let a = self.audit(audit_id);
        require!(
            matches!(a.status, AuditStatus::AppealWindow | AuditStatus::CouncilWindow),
            "nothing to finalize"
        );
        require!(env::block_timestamp_ms() >= a.deadline_ms, "the window is still open");
        self.finalize_audit(audit_id);
    }

    /// If the jury or panel never answers, anyone can unstick the claim.
    pub fn cancel_stale(&mut self, audit_id: u64) {
        let a = self.audit(audit_id).clone();
        require!(
            matches!(a.status, AuditStatus::AwaitingJury | AuditStatus::AwaitingPanel),
            "audit is not waiting for votes"
        );
        require!(env::block_timestamp_ms() >= a.deadline_ms, "the jury still has time");
        if a.status == AuditStatus::AwaitingPanel {
            // panel failed: keep the first verdict, return the appellant's bond
            let au = self.audits.get_mut(audit_id as u32).unwrap();
            au.outcome = au.first_outcome;
            self.finalize_audit(audit_id);
            return;
        }
        if let Some(r) = &a.requester {
            self.credit(r, Currency::Usdc, a.fee.0);
        }
        self.set_markets_status(a.claim_id, a.epoch, MarketStatus::Open);
        self.claims.get_mut(a.claim_id as u32).unwrap().active_audit = None;
        self.audits.get_mut(audit_id as u32).unwrap().status = AuditStatus::Cancelled;
    }

    // ---------- pages ----------

    /// Anchor a signed AI-written page version. The request must carry
    /// `BALABLU-PAGE:<version>:<page-slug>`.
    pub fn anchor_page(&mut self, page: String, version: u32, reply: SignedReply) {
        require!(env::predecessor_account_id() == self.config.keeper, "only the keeper anchors pages");
        let key_model = self
            .jury_keys
            .get(&reply.public_key_hex.trim().to_lowercase())
            .cloned()
            .unwrap_or_else(|| env::panic_str("unregistered enclave key"));
        let checked = jury::verify(&reply, &key_model).unwrap_or_else(|e| env::panic_str(&e));
        let slug = jury::slug(&page);
        let want = format!("{}{}:{}", jury::PAGE_PREFIX, version, slug);
        require!(jury::find_tag(&reply.request.0, jury::PAGE_PREFIX).as_deref() == Some(want.as_str()), "page tag missing");
        let last = self.pages.get(&slug).map(|p| p.version).unwrap_or(0);
        require!(version == last + 1, "versions must go up by one");
        self.pages.insert(
            slug,
            PageAnchor {
                page,
                version,
                model: checked.model,
                request_sha256: checked.request_sha256,
                response_sha256: checked.response_sha256,
                anchored_ms: env::block_timestamp_ms(),
            },
        );
    }

    // ---------- jury keys ----------

    /// Register an enclave signing key (checked off-chain against its TDX +
    /// GPU attestation report). `model` = model id, or "*gateway*" for the
    /// NEAR AI gateway key that signs third-party attested models.
    pub fn register_jury_key(&mut self, model: String, public_key_hex: String) {
        self.assert_owner();
        require!(!model.is_empty() && (model == GATEWAY || !model.contains(':')), "bad model id");
        let pk = jury::decode_fixed::<32>(&public_key_hex).unwrap_or_else(|| env::panic_str("bad public key"));
        self.jury_keys.insert(hex::encode(pk), model);
    }

    pub fn remove_jury_key(&mut self, public_key_hex: String) {
        self.assert_owner();
        self.jury_keys.remove(&public_key_hex.to_lowercase());
    }

    pub fn jury_key_model(&self, public_key_hex: String) -> Option<String> {
        self.jury_keys.get(&public_key_hex.to_lowercase()).cloned()
    }

    /// Check any signed NEAR AI reply (no audit needed). Handy for explorers.
    pub fn check_ai_reply(&self, request: Base64VecU8, response: Base64VecU8, public_key_hex: String, signature_hex: String) -> ReplyCheck {
        let reply = SignedReply { request, response, public_key_hex, signature_hex };
        if jury::decode_fixed::<32>(&reply.public_key_hex).is_none() {
            return ReplyCheck { valid: false, model: None, binding: None, reason: "bad public key".into() };
        }
        let key_model = match self.jury_keys.get(&reply.public_key_hex.trim().to_lowercase()) {
            Some(m) => m.clone(),
            None => return ReplyCheck { valid: false, model: None, binding: None, reason: "unregistered key".into() },
        };
        match jury::verify(&reply, &key_model) {
            Ok(c) => ReplyCheck {
                valid: true,
                model: Some(c.model),
                binding: jury::find_tag(&reply.request.0, jury::AUDIT_PREFIX),
                reason: "ok".into(),
            },
            Err(e) => ReplyCheck { valid: false, model: None, binding: None, reason: e },
        }
    }

    // ---------- admin ----------

    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        require!(config.fee_bps <= 500, "fee too high");
        require!(!config.jury_models.is_empty() && config.panel_models.len() >= config.jury_models.len(), "bad jury lists");
        self.config = config;
    }

    // ---------- views ----------

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn claims_count(&self) -> u64 {
        self.claims.len() as u64
    }

    pub fn get_claim(&self, claim_id: u64) -> Option<Claim> {
        self.claims.get(claim_id as u32).cloned()
    }

    pub fn get_claims(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Claim> {
        let from = from_index.unwrap_or(0) as u32;
        let limit = limit.unwrap_or(50).min(100) as u32;
        (from..self.claims.len().min(from.saturating_add(limit))).filter_map(|i| self.claims.get(i).cloned()).collect()
    }

    pub fn get_evidence(&self, claim_id: u64) -> Vec<Evidence> {
        match self.claims.get(claim_id as u32) {
            Some(c) => c.evidence.iter().filter_map(|i| self.evidence.get(*i as u32).cloned()).collect(),
            None => vec![],
        }
    }

    pub fn audits_count(&self) -> u64 {
        self.audits.len() as u64
    }

    pub fn get_audit(&self, audit_id: u64) -> Option<Audit> {
        self.audits.get(audit_id as u32).cloned()
    }

    /// The exact question the jury must be asked for this audit's current round.
    pub fn get_jury_prompt(&self, audit_id: u64) -> Option<JuryPrompt> {
        let a = self.audits.get(audit_id as u32)?;
        Some(self.jury_prompt(a))
    }

    pub fn get_page_anchor(&self, page: String) -> Option<PageAnchor> {
        self.pages.get(&jury::slug(&page)).cloned()
    }

    pub fn get_market(&self, claim_id: u64, currency: Currency, epoch: Option<u32>) -> Option<MarketView> {
        let epoch = match epoch {
            Some(e) => e,
            None => self.claims.get(claim_id as u32)?.epoch,
        };
        let m = self.markets.get(&(claim_id, epoch, currency.tag()))?;
        Some(MarketView {
            claim_id,
            epoch,
            currency,
            status: m.status,
            fact_odds_bps: m.pool.price_fact_bps(),
            fact_reserve: U128(m.pool.fact),
            balablu_reserve: U128(m.pool.balablu),
            collateral: U128(m.sets),
            volume: U128(m.volume),
            payout_fact_bps: m.payout_fact_bps,
        })
    }

    pub fn get_position(&self, account_id: AccountId, claim_id: u64, epoch: u32, currency: Currency) -> PositionView {
        let p = self.positions.get(&(account_id, claim_id, epoch, currency.tag())).cloned().unwrap_or_default();
        PositionView { fact: U128(p.fact), balablu: U128(p.balablu), spent: U128(p.spent) }
    }

    pub fn get_wallet(&self, account_id: AccountId) -> WalletView {
        let w = self.wallets.get(&account_id).cloned().unwrap_or_default();
        WalletView { points: U128(w.points), usdc: U128(w.usdc), got_points: w.got_points }
    }

    /// "Bet $2, win $2.38 if you're right."
    pub fn quote_buy(&self, claim_id: u64, side: Side, currency: Currency, amount: U128) -> Option<Quote> {
        let epoch = self.claims.get(claim_id as u32)?.epoch;
        let m = self.markets.get(&(claim_id, epoch, currency.tag()))?;
        let fee = amount.0 * self.config.fee_bps as u128 / BPS;
        let mut pool = m.pool;
        let shares = pool.buy(side == Side::Fact, amount.0 - fee);
        Some(Quote { shares: U128(shares), payout_if_right: U128(shares), fee: U128(fee), fact_odds_after_bps: pool.price_fact_bps() })
    }
}

// ---------- internals ----------
impl BalaBlu {
    fn fresh(owner: AccountId, usdc_token: AccountId, max_bet_usdc: U128) -> Self {
        Self {
            owner: owner.clone(),
            jury_keys: LookupMap::new(StorageKey::JuryKeys),
            config: Config {
                usdc_token,
                max_bet_usdc,
                fee_bps: 100,
                practice_grant: U128(1_000 * ONE),
                practice_seed: U128(10_000 * ONE),
                usdc_seed: U128(0),
                keeper: owner.clone(),
                council: owner.clone(),
                relayer: owner,
                jury_models: vec![
                    "Qwen/Qwen3.8-27B".into(),
                    "deepseek-ai/DeepSeek-V4.1-Flash-1017".into(),
                    "z-ai/glm-5.3-flash".into(),
                ],
                panel_models: vec![
                    "Qwen/Qwen3.8-27B".into(),
                    "deepseek-ai/DeepSeek-V4.1-Flash-1017".into(),
                    "z-ai/glm-5.3-flash".into(),
                    "moonshotai/kimi-k2.6".into(),
                    "z-ai/glm-5.3".into(),
                ],
                audit_fee: U128(ONE / 2),
                appeal_bond: U128(2 * ONE),
                appeal_window_ms: 10 * 60 * 1000,
                jury_timeout_ms: 60 * 60 * 1000,
                surprise_bps: 2_000,
                roll_interval_ms: 10 * 60 * 1000,
            },
            claims: Vector::new(StorageKey::Claims),
            markets: LookupMap::new(StorageKey::Markets),
            positions: LookupMap::new(StorageKey::Positions),
            wallets: LookupMap::new(StorageKey::Wallets),
            evidence: Vector::new(StorageKey::Evidence),
            audits: Vector::new(StorageKey::Audits),
            pages: LookupMap::new(StorageKey::Pages),
        }
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only owner");
    }

    fn claim(&self, claim_id: u64) -> &Claim {
        self.claims.get(claim_id as u32).unwrap_or_else(|| env::panic_str("no such claim"))
    }

    fn audit(&self, audit_id: u64) -> &Audit {
        self.audits.get(audit_id as u32).unwrap_or_else(|| env::panic_str("no such audit"))
    }

    fn wallet_mut(&mut self, who: &AccountId) -> &mut Wallet {
        if !self.wallets.contains_key(who) {
            self.wallets.insert(who.clone(), Wallet::default());
        }
        self.wallets.get_mut(who).unwrap()
    }

    fn position_mut(&mut self, who: &AccountId, claim_id: u64, epoch: u32, currency: Currency) -> &mut Position {
        let key = (who.clone(), claim_id, epoch, currency.tag());
        if !self.positions.contains_key(&key) {
            self.positions.insert(key.clone(), Position::default());
        }
        self.positions.get_mut(&key).unwrap()
    }

    fn debit(&mut self, who: &AccountId, currency: Currency, amount: u128) {
        let w = self.wallet_mut(who);
        let bal = match currency {
            Currency::Points => &mut w.points,
            Currency::Usdc => &mut w.usdc,
        };
        require!(*bal >= amount, "not enough balance");
        *bal -= amount;
    }

    fn credit(&mut self, who: &AccountId, currency: Currency, amount: u128) {
        if amount == 0 {
            return;
        }
        let w = self.wallet_mut(who);
        match currency {
            Currency::Points => w.points += amount,
            Currency::Usdc => w.usdc += amount,
        }
    }

    fn set_markets_status(&mut self, claim_id: u64, epoch: u32, status: MarketStatus) {
        for c in [Currency::Points, Currency::Usdc] {
            if let Some(m) = self.markets.get_mut(&(claim_id, epoch, c.tag())) {
                if m.status != MarketStatus::Resolved {
                    m.status = status;
                }
            }
        }
    }

    fn start_audit(&mut self, claim_id: u64, kind: AuditKind, requester: Option<AccountId>, fee: u128) -> u64 {
        let c = self.claim(claim_id).clone();
        require!(c.active_audit.is_none(), "this claim is already being audited");
        let m = self.markets.get(&(claim_id, c.epoch, Currency::Points.tag())).unwrap_or_else(|| env::panic_str("no market"));
        require!(m.status == MarketStatus::Open, "market is not open");
        let items: Vec<(String, String)> = c
            .evidence
            .iter()
            .filter_map(|i| self.evidence.get(*i as u32).map(|e| (e.url.clone(), e.quote.clone())))
            .collect();
        let root = hex::encode(env::sha256(jury::evidence_section(&items).as_bytes()));
        let id = self.audits.len() as u64;
        let now = env::block_timestamp_ms();
        self.audits.push(Audit {
            id,
            claim_id,
            epoch: c.epoch,
            kind,
            requester,
            fee: U128(fee),
            status: AuditStatus::AwaitingJury,
            round: 1,
            evidence_ids: c.evidence.clone(),
            evidence_root: root,
            started_ms: now,
            deadline_ms: now + self.config.jury_timeout_ms,
            first_outcome: None,
            outcome: None,
            votes: vec![],
            appellant: None,
            bond: U128(0),
            council_overruled: false,
        });
        self.set_markets_status(claim_id, c.epoch, MarketStatus::Paused);
        let cm = self.claims.get_mut(claim_id as u32).unwrap();
        cm.active_audit = Some(id);
        cm.audits.push(id);
        id
    }

    fn jury_prompt(&self, a: &Audit) -> JuryPrompt {
        let c = self.claim(a.claim_id);
        let items: Vec<(String, String)> = a
            .evidence_ids
            .iter()
            .filter_map(|i| self.evidence.get(*i as u32).map(|e| (e.url.clone(), e.quote.clone())))
            .collect();
        let binding = jury::audit_binding(a.id, a.round, &a.evidence_root);
        let user = jury::jury_user_prompt(&binding, &c.text, &c.rule, &jury::evidence_section(&items));
        let models = if a.round == 1 { self.config.jury_models.clone() } else { self.config.panel_models.clone() };
        JuryPrompt { audit_id: a.id, round: a.round, models, system: jury::JURY_SYSTEM.to_string(), user, binding }
    }

    /// Count votes for a round. Majority of the round's models wins; otherwise
    /// the claim is unresolvable (refund at last odds).
    pub(crate) fn apply_round(&mut self, audit_id: u64, votes: Vec<Vote>) -> Outcome {
        let n = votes.len();
        let fact = votes.iter().filter(|v| v.verdict == Verdict::Fact).count();
        let bla = votes.iter().filter(|v| v.verdict == Verdict::Balablu).count();
        let outcome = if fact * 2 > n {
            Outcome::Fact
        } else if bla * 2 > n {
            Outcome::Balablu
        } else {
            Outcome::Unresolvable
        };
        let window = self.config.appeal_window_ms;
        let now = env::block_timestamp_ms();
        let a = self.audits.get_mut(audit_id as u32).unwrap();
        let ev_ids = a.evidence_ids.clone();
        a.votes.extend(votes);
        a.outcome = Some(outcome);
        a.deadline_ms = now + window;
        if a.round == 1 {
            a.first_outcome = Some(outcome);
            a.status = AuditStatus::AppealWindow;
        } else {
            a.status = AuditStatus::CouncilWindow;
        }
        for id in ev_ids {
            if let Some(e) = self.evidence.get_mut(id as u32) {
                e.uses += 1;
            }
        }
        outcome
    }

    fn finalize_audit(&mut self, audit_id: u64) {
        let a = self.audit(audit_id).clone();
        let outcome = a.outcome.unwrap_or(Outcome::Unresolvable);
        let owner = self.owner.clone();
        // the bond comes back if the appeal changed the result (or the panel never answered)
        if let Some(app) = &a.appellant {
            let panel_answered = a.status == AuditStatus::CouncilWindow;
            if !panel_answered || Some(outcome) != a.first_outcome {
                self.credit(app, Currency::Usdc, a.bond.0);
            } else {
                self.credit(&owner, Currency::Usdc, a.bond.0);
            }
        }
        self.credit(&owner, Currency::Usdc, a.fee.0);
        {
            let au = self.audits.get_mut(audit_id as u32).unwrap();
            au.status = AuditStatus::Final;
            au.outcome = Some(outcome);
        }
        self.claims.get_mut(a.claim_id as u32).unwrap().active_audit = None;
        self.settle(a.claim_id, outcome);
    }

    /// Open the practice market (seeded with free points) and, if the owner
    /// can fund it, the USDC market.
    fn open_markets(&mut self, claim_id: u64, epoch: u32, fact_odds_bps: u32, usdc_seed: u128) {
        let me = env::current_account_id();
        let (pool, _, _) = fpmm::seed(self.config.practice_seed.0, fact_odds_bps);
        self.markets.insert(
            (claim_id, epoch, Currency::Points.tag()),
            Market { pool, sets: self.config.practice_seed.0, status: MarketStatus::Open, payout_fact_bps: 0, volume: 0, lp: me },
        );
        if usdc_seed > 0 {
            let owner = self.owner.clone();
            let w = self.wallet_mut(&owner);
            if w.usdc >= usdc_seed {
                w.usdc -= usdc_seed;
                let (pool, lf, lb) = fpmm::seed(usdc_seed, fact_odds_bps);
                self.markets.insert(
                    (claim_id, epoch, Currency::Usdc.tag()),
                    Market { pool, sets: usdc_seed, status: MarketStatus::Open, payout_fact_bps: 0, volume: 0, lp: owner.clone() },
                );
                let pos = self.position_mut(&owner, claim_id, epoch, Currency::Usdc);
                pos.fact += lf;
                pos.balablu += lb;
                pos.spent += usdc_seed;
            } else {
                env::log_str("owner wallet too low to seed the USDC market; practice only");
            }
        }
    }

    /// Resolve the current epoch's markets and open the next epoch.
    pub(crate) fn settle(&mut self, claim_id: u64, outcome: Outcome) -> u32 {
        let epoch = self.claim(claim_id).epoch;
        let mut last_odds = 5_000u32;
        for c in [Currency::Points, Currency::Usdc] {
            let key = (claim_id, epoch, c.tag());
            let (lp, pool) = match self.markets.get_mut(&key) {
                Some(m) => {
                    require!(m.status != MarketStatus::Resolved, "already settled");
                    let odds = m.pool.price_fact_bps();
                    if c == Currency::Points || m.volume > 0 {
                        last_odds = odds;
                    }
                    m.payout_fact_bps = match outcome {
                        Outcome::Fact => BPS as u32,
                        Outcome::Balablu => 0,
                        Outcome::Unresolvable => odds,
                    };
                    m.status = MarketStatus::Resolved;
                    let pool = m.pool;
                    m.pool = Pool { fact: 0, balablu: 0 };
                    (m.lp.clone(), pool)
                }
                None => continue,
            };
            // the pool's own shares belong to whoever seeded it
            if c == Currency::Usdc {
                let pos = self.position_mut(&lp, claim_id, epoch, c);
                pos.fact += pool.fact;
                pos.balablu += pool.balablu;
            }
        }
        let next_odds = match outcome {
            Outcome::Fact => 9_000,
            Outcome::Balablu => 1_000,
            Outcome::Unresolvable => last_odds,
        };
        let next = epoch + 1;
        self.claims.get_mut(claim_id as u32).unwrap().epoch = next;
        let seed = self.config.usdc_seed.0;
        self.open_markets(claim_id, next, next_odds, seed);
        next
    }
}
