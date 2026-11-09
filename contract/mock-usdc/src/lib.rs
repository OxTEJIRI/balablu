//! Free-mint test USDC for BalaBlu on NEAR testnet (6 decimals).
//! A small NEP-141 subset: enough for wallets and `ft_transfer_call`.
//! Anyone can `mint` up to 1,000 per call so judges can try BalaBlu.
//! NEVER deploy to mainnet.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, PanicOnDefault, PromiseError, PromiseOrValue};

const MAX_MINT: u128 = 1_000 * 1_000_000;

#[near(serializers = [json])]
pub struct FtMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[ext_contract(ext_receiver)]
#[allow(dead_code)]
trait FtReceiver {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockUsdc {
    balances: LookupMap<AccountId, u128>,
    total: u128,
}

#[near]
impl MockUsdc {
    #[init]
    pub fn new() -> Self {
        Self { balances: LookupMap::new(b"b"), total: 0 }
    }

    /// Free test money (max 1,000 USDC per call).
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(amount.0 > 0 && amount.0 <= MAX_MINT, "mint 0 < amount <= 1000 USDC");
        self.add(&account_id, amount.0);
        self.total += amount.0;
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.bal(&account_id))
    }

    pub fn ft_metadata(&self) -> FtMetadata {
        FtMetadata {
            spec: "ft-1.0.0".into(),
            name: "Test USDC (BalaBlu testnet)".into(),
            symbol: "USDC".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }

    /// No storage fees on this test token; kept for wallet compatibility.
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let _ = (account_id, registration_only);
        StorageBalance { total: U128(0), available: U128(0) }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        let _ = account_id;
        Some(StorageBalance { total: U128(0), available: U128(0) })
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        near_sdk::assert_one_yocto();
        let _ = memo;
        let sender = env::predecessor_account_id();
        self.move_funds(&sender, &receiver_id, amount.0);
    }

    #[payable]
    pub fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        near_sdk::assert_one_yocto();
        let _ = memo;
        require!(env::prepaid_gas() >= Gas::from_tgas(50), "attach at least 50 Tgas");
        let sender = env::predecessor_account_id();
        self.move_funds(&sender, &receiver_id, amount.0);
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(Gas::from_tgas(20))
            .ft_on_transfer(sender.clone(), amount, msg)
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).ft_resolve_transfer(sender, receiver_id, amount))
            .into()
    }

    /// Refund whatever the receiver did not use. Returns the amount used.
    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
        #[callback_result] unused: Result<U128, PromiseError>,
    ) -> U128 {
        let unused = match unused {
            Ok(u) => u.0.min(amount.0),
            Err(_) => amount.0,
        };
        if unused > 0 {
            let refund = unused.min(self.bal(&receiver_id));
            if refund > 0 {
                self.move_funds(&receiver_id, &sender_id, refund);
            }
            return U128(amount.0 - refund);
        }
        amount
    }
}

impl MockUsdc {
    fn bal(&self, a: &AccountId) -> u128 {
        self.balances.get(a).copied().unwrap_or(0)
    }

    fn add(&mut self, a: &AccountId, amt: u128) {
        let b = self.bal(a) + amt;
        self.balances.insert(a.clone(), b);
    }

    fn move_funds(&mut self, from: &AccountId, to: &AccountId, amt: u128) {
        require!(amt > 0, "amount must be positive");
        require!(from != to, "sender and receiver must differ");
        let fb = self.bal(from);
        require!(fb >= amt, "not enough balance");
        self.balances.insert(from.clone(), fb - amt);
        self.add(to, amt);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, NearToken};

    fn as_(who: &str, yocto: u128) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who.parse().unwrap()).attached_deposit(NearToken::from_yoctonear(yocto));
        testing_env!(b.build());
    }

    #[test]
    fn mint_and_transfer() {
        as_("ada.testnet", 0);
        let mut t = MockUsdc::new();
        t.mint("ada.testnet".parse().unwrap(), U128(5_000_000));
        as_("ada.testnet", 1);
        t.ft_transfer("kemi.testnet".parse().unwrap(), U128(2_000_000), None);
        assert_eq!(t.ft_balance_of("ada.testnet".parse().unwrap()).0, 3_000_000);
        assert_eq!(t.ft_balance_of("kemi.testnet".parse().unwrap()).0, 2_000_000);
        assert_eq!(t.ft_total_supply().0, 5_000_000);
    }

    #[test]
    #[should_panic(expected = "mint 0 < amount")]
    fn mint_is_capped() {
        as_("ada.testnet", 0);
        let mut t = MockUsdc::new();
        t.mint("ada.testnet".parse().unwrap(), U128(MAX_MINT + 1));
    }

    #[test]
    #[should_panic(expected = "not enough balance")]
    fn cannot_overspend() {
        as_("ada.testnet", 0);
        let mut t = MockUsdc::new();
        as_("ada.testnet", 1);
        t.ft_transfer("kemi.testnet".parse().unwrap(), U128(1), None);
    }
}
