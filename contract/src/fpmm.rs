//! Binary fixed-product market maker (FPMM), integer maths only.
//!
//! A pool holds FACT and BALABLU shares. One unit of collateral always mints
//! one FACT + one BALABLU share (a "complete set"), so whatever the verdict,
//! the contract can always pay every winning share 1 unit.
//!
//! Price of FACT = balablu_reserve / (fact_reserve + balablu_reserve).
//! All rounding favours the pool, so traders can never drain it.

use near_sdk::near;

pub const BPS: u128 = 10_000;
/// Lowest / highest starting odds a market may be seeded with (1% .. 99%).
pub const MIN_SEED_BPS: u32 = 100;
pub const MAX_SEED_BPS: u32 = 9_900;

#[near(serializers = [borsh])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pool {
    pub fact: u128,
    pub balablu: u128,
}

impl Pool {
    /// Odds that the claim is a FACT, in basis points.
    pub fn price_fact_bps(&self) -> u32 {
        let total = self.fact + self.balablu;
        if total == 0 {
            return 5_000;
        }
        (self.balablu * BPS / total) as u32
    }

    /// Buy one side with `amount` collateral (fee already taken).
    /// Returns the shares the buyer receives.
    pub fn buy(&mut self, fact: bool, amount: u128) -> u128 {
        let (a, b) = self.split(fact);
        let k = a * b;
        let a1 = a + amount;
        let b1 = b + amount;
        let new_a = ceil_div(k, b1);
        let shares = a1 - new_a;
        self.join(fact, new_a, b1);
        shares
    }

    /// Sell `shares` of one side back to the pool. Returns collateral out
    /// (before fee). Solves (a + s - r)(b - r) = a*b for r, rounding r down.
    pub fn sell(&mut self, fact: bool, shares: u128) -> u128 {
        let (a, b) = self.split(fact);
        let sum = a + shares + b;
        let disc = sum * sum - 4 * shares * b;
        let r = (sum - sqrt_ceil(disc)) / 2;
        self.join(fact, a + shares - r, b - r);
        r
    }

    /// Shares you would get for `amount` without changing the pool.
    pub fn quote_buy(&self, fact: bool, amount: u128) -> u128 {
        let mut p = *self;
        p.buy(fact, amount)
    }

    fn split(&self, fact: bool) -> (u128, u128) {
        if fact {
            (self.fact, self.balablu)
        } else {
            (self.balablu, self.fact)
        }
    }

    fn join(&mut self, fact: bool, a: u128, b: u128) {
        if fact {
            self.fact = a;
            self.balablu = b;
        } else {
            self.balablu = a;
            self.fact = b;
        }
    }
}

/// Seed a pool with `collateral` so it starts at `fact_bps` odds.
/// Returns (pool, leftover FACT shares, leftover BALABLU shares) — the
/// leftovers belong to whoever seeded the pool.
pub fn seed(collateral: u128, fact_bps: u32) -> (Pool, u128, u128) {
    let p = fact_bps.clamp(MIN_SEED_BPS, MAX_SEED_BPS) as u128;
    if p >= 5_000 {
        let balablu = collateral;
        let fact = collateral * (BPS - p) / p;
        (Pool { fact, balablu }, collateral - fact, 0)
    } else {
        let fact = collateral;
        let balablu = collateral * p / (BPS - p);
        (Pool { fact, balablu }, 0, collateral - balablu)
    }
}

pub fn ceil_div(a: u128, b: u128) -> u128 {
    if a == 0 {
        0
    } else {
        (a - 1) / b + 1
    }
}

pub fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

pub fn sqrt_ceil(n: u128) -> u128 {
    let r = isqrt(n);
    if r * r == n {
        r
    } else {
        r + 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ONE: u128 = 1_000_000; // 1 USDC

    #[test]
    fn sqrt_is_exact() {
        for n in [0u128, 1, 2, 3, 4, 15, 16, 17, 1_000_000, 999_999_999_999] {
            let r = isqrt(n);
            assert!(r * r <= n && (r + 1) * (r + 1) > n, "n={n}");
            let c = sqrt_ceil(n);
            assert!(c * c >= n && (c == 0 || (c - 1) * (c - 1) < n), "n={n}");
        }
    }

    #[test]
    fn seed_sets_starting_odds() {
        for bps in [100u32, 1_000, 3_300, 5_000, 6_100, 8_400, 9_900] {
            let (pool, lf, lb) = seed(5 * ONE, bps);
            let got = pool.price_fact_bps() as i64;
            assert!((got - bps as i64).abs() <= 1, "want {bps} got {got}");
            // collateral is fully accounted for: every set is in the pool or with the seeder
            assert_eq!(pool.fact + lf, 5 * ONE);
            assert_eq!(pool.balablu + lb, 5 * ONE);
        }
    }

    #[test]
    fn buying_fact_raises_fact_odds() {
        let (mut pool, _, _) = seed(5 * ONE, 5_000);
        let before = pool.price_fact_bps();
        let shares = pool.buy(true, 2 * ONE);
        assert!(pool.price_fact_bps() > before);
        // at 50% odds, $2 buys more than 2 shares (win > stake)
        assert!(shares > 2 * ONE && shares < 4 * ONE, "{shares}");
    }

    #[test]
    fn payout_matches_odds_for_small_bets() {
        // at 84% FACT, a tiny FACT bet pays about 1/0.84 per unit
        let (pool, _, _) = seed(1_000 * ONE, 8_400);
        let shares = pool.quote_buy(true, ONE);
        let expect = ONE * BPS / 8_400;
        assert!(shares <= expect && expect - shares < ONE / 500, "{shares} vs {expect}");
    }

    #[test]
    fn round_trip_never_profits() {
        let (mut pool, _, _) = seed(5 * ONE, 3_000);
        let start = pool;
        for amt in [1u128, 7, ONE / 3, ONE, 2 * ONE] {
            for fact in [true, false] {
                let s = pool.buy(fact, amt);
                let back = pool.sell(fact, s);
                assert!(back <= amt, "bought {amt} sold for {back}");
            }
        }
        // the pool only ever gains from rounding
        assert!(pool.fact * pool.balablu >= start.fact * start.balablu);
    }

    #[test]
    fn product_never_decreases() {
        let (mut pool, _, _) = seed(5 * ONE, 6_000);
        let mut k = pool.fact * pool.balablu;
        let mut held = (0u128, 0u128);
        for i in 0..200u128 {
            let fact = i % 3 != 0;
            let amt = (i * 7_919) % (2 * ONE) + 1;
            let s = pool.buy(fact, amt);
            if fact { held.0 += s } else { held.1 += s }
            assert!(pool.fact * pool.balablu >= k);
            k = pool.fact * pool.balablu;
            if i % 5 == 0 && held.0 > 10 {
                let sell = held.0 / 2;
                pool.sell(true, sell);
                held.0 -= sell;
                assert!(pool.fact * pool.balablu >= k);
                k = pool.fact * pool.balablu;
            }
        }
    }
}
