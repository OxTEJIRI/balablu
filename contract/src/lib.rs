//! BalaBlu contract — the encyclopedia where every fact has odds.
//!
//! * Claims: short checkable sentences, each with a rule for FACT / BALABLU.
//! * Markets: one binary FPMM per claim, per epoch, per currency
//!   (free practice points, or USDC). Perpetual: when an epoch is settled a new
//!   one opens near the verdict.
//! * Jury check: NEAR AI Cloud enclave replies are verified on-chain
//!   (`check_ai_reply`): the contract re-hashes the exact request/response
//!   bytes and checks the enclave's ed25519 signature itself.

pub mod fpmm;
#[cfg(test)]
mod tests;

use fpmm::{Pool, BPS};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    Promise, PromiseOrValue,
};

/// Every jury prompt carries this tag so a signed reply can only be used for
/// the audit it was produced for.
pub const BINDING_PREFIX: &str = "BALABLU-AUDIT:";
/// 1 USDC / 1 practice point (both use 6 decimals).
pub const ONE: u128 = 1_000_000;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    // order matters: JuryKeys must stay first (existing testnet state)
    JuryKeys,
    Claims,
    Markets,
    Positions,
    Wallets,
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
    /// Jury split or no evidence: refund at the last price.
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
}

// ---------- JSON views ----------

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq)]
pub struct ReplyCheck {
    pub valid: bool,
    pub model: Option<String>,
    pub binding: Option<String>,
    pub signed_text: Option<String>,
    pub reason: String,
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
    /// lowercase hex ed25519 public key -> canonical NEAR AI model id
    jury_keys: LookupMap<String, String>,
    config: Config,
    claims: Vector<Claim>,
    markets: LookupMap<(u64, u32, u8), Market>,
    positions: LookupMap<(AccountId, u64, u32, u8), Position>,
    wallets: LookupMap<AccountId, Wallet>,
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
        let grant = self.config.practice_grant.0;
        let w = self.wallet_mut(&who);
        require!(!w.got_points, "practice points already claimed");
        w.got_points = true;
        w.points += grant;
        U128(w.points)
    }

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

    // ---------- claims ----------

    /// Create a claim. Opens a practice market and, if `usdc_seed` > 0, a USDC
    /// market seeded from the owner's wallet. Owner only for now.
    pub fn create_claim(
        &mut self,
        page: String,
        text: String,
        rule: String,
        sources: Vec<String>,
        fact_odds_bps: u32,
        usdc_seed: U128,
    ) -> u64 {
        self.assert_owner();
        require!(!text.is_empty() && text.len() <= 280, "claim text must be 1-280 chars");
        require!(page.len() <= 80 && rule.len() <= 600 && sources.len() <= 10, "claim too long");
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
        });
        self.open_markets(id, 0, fact_odds_bps, usdc_seed.0);
        id
    }

    // ---------- trading ----------

    /// Bet `amount` on a side. Returns shares received (each pays 1 if right).
    pub fn buy(&mut self, claim_id: u64, side: Side, currency: Currency, amount: U128, min_shares: Option<U128>) -> U128 {
        let who = env::predecessor_account_id();
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

    /// Cash out shares early at the current odds. Returns collateral received.
    pub fn sell(&mut self, claim_id: u64, side: Side, currency: Currency, shares: U128, min_out: Option<U128>) -> U128 {
        let who = env::predecessor_account_id();
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

    /// Collect winnings from a settled epoch.
    pub fn redeem(&mut self, claim_id: u64, epoch: u32, currency: Currency) -> U128 {
        let who = env::predecessor_account_id();
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

    // ---------- settlement (owner for now; Day 3: jury-verified audits) ----------

    pub fn set_paused(&mut self, claim_id: u64, paused: bool) {
        self.assert_owner();
        let epoch = self.claim(claim_id).epoch;
        for c in [Currency::Points, Currency::Usdc] {
            if let Some(m) = self.markets.get_mut(&(claim_id, epoch, c.tag())) {
                require!(m.status != MarketStatus::Resolved, "already settled");
                m.status = if paused { MarketStatus::Paused } else { MarketStatus::Open };
            }
        }
    }

    /// Settle the current epoch and open the next one near the verdict.
    pub fn settle_epoch(&mut self, claim_id: u64, outcome: Outcome) -> u32 {
        self.assert_owner();
        self.settle(claim_id, outcome)
    }

    // ---------- jury keys ----------

    /// Register an enclave signing key (verified off-chain against its TDX +
    /// GPU attestation report) for a model.
    pub fn register_jury_key(&mut self, model: String, public_key_hex: String) {
        self.assert_owner();
        require!(!model.is_empty() && !model.contains(':'), "bad model id");
        let pk = decode_fixed::<32>(&public_key_hex).unwrap_or_else(|| env::panic_str("bad public key"));
        self.jury_keys.insert(hex::encode(pk), model);
    }

    pub fn remove_jury_key(&mut self, public_key_hex: String) {
        self.assert_owner();
        self.jury_keys.remove(&public_key_hex.to_lowercase());
    }

    pub fn jury_key_model(&self, public_key_hex: String) -> Option<String> {
        self.jury_keys.get(&public_key_hex.to_lowercase()).cloned()
    }

    /// Verify a NEAR AI Cloud `provider_tee` ed25519 signature over the exact
    /// request and response bytes.
    pub fn check_ai_reply(
        &self,
        request: Base64VecU8,
        response: Base64VecU8,
        public_key_hex: String,
        signature_hex: String,
    ) -> ReplyCheck {
        let fail = |reason: &str| ReplyCheck { valid: false, model: None, binding: None, signed_text: None, reason: reason.into() };
        let pk = match decode_fixed::<32>(&public_key_hex) {
            Some(pk) => pk,
            None => return fail("bad public key"),
        };
        let model = match self.jury_keys.get(&hex::encode(pk)) {
            Some(m) => m.clone(),
            None => return fail("unregistered key"),
        };
        let sig = match decode_fixed::<64>(&signature_hex) {
            Some(s) => s,
            None => return fail("bad signature encoding"),
        };
        let text = format!("{}:{}:{}", model, hex::encode(env::sha256(&request.0)), hex::encode(env::sha256(&response.0)));
        if !env::ed25519_verify(&sig, text.as_bytes(), &pk) {
            return ReplyCheck { valid: false, model: Some(model), binding: None, signed_text: Some(text), reason: "signature does not match".into() };
        }
        ReplyCheck { valid: true, model: Some(model), binding: find_binding(&request.0), signed_text: Some(text), reason: "ok".into() }
    }

    // ---------- admin ----------

    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        require!(config.fee_bps <= 500, "fee too high");
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
        (from..self.claims.len().min(from.saturating_add(limit)))
            .filter_map(|i| self.claims.get(i).cloned())
            .collect()
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
            owner,
            jury_keys: LookupMap::new(StorageKey::JuryKeys),
            config: Config {
                usdc_token,
                max_bet_usdc,
                fee_bps: 100,
                practice_grant: U128(1_000 * ONE),
                practice_seed: U128(10_000 * ONE),
                usdc_seed: U128(0),
            },
            claims: Vector::new(StorageKey::Claims),
            markets: LookupMap::new(StorageKey::Markets),
            positions: LookupMap::new(StorageKey::Positions),
            wallets: LookupMap::new(StorageKey::Wallets),
        }
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only owner");
    }

    fn claim(&self, claim_id: u64) -> &Claim {
        self.claims.get(claim_id as u32).unwrap_or_else(|| env::panic_str("no such claim"))
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

    fn settle(&mut self, claim_id: u64, outcome: Outcome) -> u32 {
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

fn decode_fixed<const N: usize>(s: &str) -> Option<[u8; N]> {
    let s = s.trim().trim_start_matches("0x");
    hex::decode(s).ok()?.try_into().ok()
}

/// Extract `BALABLU-AUDIT:<id>:<root>` from the raw request bytes.
pub fn find_binding(request: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(request);
    let start = text.find(BINDING_PREFIX)?;
    let tag: String = text[start..]
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '_' | '-'))
        .collect();
    let parts: Vec<&str> = tag.split(':').collect();
    if parts.len() == 3 && !parts[1].is_empty() && !parts[2].is_empty() {
        Some(tag)
    } else {
        None
    }
}
