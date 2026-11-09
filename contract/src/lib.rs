//! BalaBlu contract — the encyclopedia where every fact has odds.
//!
//! Day 1 scaffold: the on-chain check for NEAR AI Cloud jury replies.
//! A NEAR AI enclave signs `MODEL:sha256(request):sha256(response)` with an
//! ed25519 key. The owner registers each attested enclave key here, and the
//! contract re-hashes the exact request/response bytes and verifies the
//! signature itself, so nobody (including the BalaBlu operator) can forge or
//! edit a jury verdict.

use near_sdk::json_types::Base64VecU8;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

/// Every jury prompt carries this tag so a signed reply can only be used for
/// the audit it was produced for.
pub const BINDING_PREFIX: &str = "BALABLU-AUDIT:";

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    JuryKeys,
}

/// Result of checking one signed AI reply.
#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq)]
pub struct ReplyCheck {
    pub valid: bool,
    /// Model registered for the signing key.
    pub model: Option<String>,
    /// `BALABLU-AUDIT:<audit_id>:<evidence_root>` found in the request.
    pub binding: Option<String>,
    /// The exact text the enclave signed (useful for explorers / debugging).
    pub signed_text: Option<String>,
    pub reason: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BalaBlu {
    owner: AccountId,
    /// lowercase hex ed25519 public key -> canonical NEAR AI model id
    jury_keys: LookupMap<String, String>,
}

#[near]
impl BalaBlu {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            jury_keys: LookupMap::new(StorageKey::JuryKeys),
        }
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

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
        let fail = |reason: &str| ReplyCheck {
            valid: false,
            model: None,
            binding: None,
            signed_text: None,
            reason: reason.to_string(),
        };
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
        let text = format!(
            "{}:{}:{}",
            model,
            hex::encode(env::sha256(&request.0)),
            hex::encode(env::sha256(&response.0))
        );
        if !env::ed25519_verify(&sig, text.as_bytes(), &pk) {
            return ReplyCheck {
                valid: false,
                model: Some(model),
                binding: None,
                signed_text: Some(text),
                reason: "signature does not match".to_string(),
            };
        }
        ReplyCheck {
            valid: true,
            model: Some(model),
            binding: find_binding(&request.0),
            signed_text: Some(text),
            reason: "ok".to_string(),
        }
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only owner");
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

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    // Real reply from NEAR AI Cloud (Qwen/Qwen3.8-27B in a TEE), captured 2026-11-09.
    const REQ: &[u8] = include_bytes!("../fixtures/qwen.request.json");
    const RESP: &[u8] = include_bytes!("../fixtures/qwen.response.json");
    const MODEL: &str = "Qwen/Qwen3.8-27B";
    const PK: &str = "89154a43a47684742c3d1753252bb6f49f61da9d8c84fc9b1def2df130cb2d93";
    const SIG: &str = "2001c1a753206586099bb28b589cbbdc92e631c106fa3030034dc85bdec9d0909b293fb5833aeb1c65b8644b118ed6bc8333287199ecd970f48cf981fdfd5908";

    fn as_caller(who: AccountId) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who);
        testing_env!(b.build());
    }

    fn setup() -> BalaBlu {
        as_caller(accounts(0));
        let mut c = BalaBlu::new(accounts(0));
        c.register_jury_key(MODEL.into(), PK.into());
        c
    }

    fn check(c: &BalaBlu, req: &[u8], resp: &[u8], pk: &str, sig: &str) -> ReplyCheck {
        c.check_ai_reply(req.to_vec().into(), resp.to_vec().into(), pk.into(), sig.into())
    }

    #[test]
    fn real_enclave_signature_verifies() {
        let c = setup();
        let r = check(&c, REQ, RESP, PK, SIG);
        assert!(r.valid, "{}", r.reason);
        assert_eq!(r.model.as_deref(), Some(MODEL));
        assert_eq!(r.binding.as_deref(), Some("BALABLU-AUDIT:test:abc"));
        assert_eq!(
            r.signed_text.as_deref(),
            Some("Qwen/Qwen3.8-27B:8c14cc76bf2e95d24938addd18b5990b56de88fce054a193c5e0efc928f29b1b:b0342223ed416acfbd4906e8255636f4dfa303e4254f253d656b04a4d0fc7101")
        );
    }

    #[test]
    fn edited_response_is_rejected() {
        let c = setup();
        let edited = String::from_utf8(RESP.to_vec()).unwrap().replace("TRUE", "FALSE");
        let r = check(&c, REQ, edited.as_bytes(), PK, SIG);
        assert!(!r.valid);
        assert_eq!(r.reason, "signature does not match");
    }

    #[test]
    fn edited_request_is_rejected() {
        let c = setup();
        let edited = String::from_utf8(REQ.to_vec()).unwrap().replace("test:abc", "test:xyz");
        assert!(!check(&c, edited.as_bytes(), RESP, PK, SIG).valid);
    }

    #[test]
    fn forged_signature_is_rejected() {
        let c = setup();
        let mut forged = SIG.to_string();
        forged.replace_range(0..2, "21");
        assert!(!check(&c, REQ, RESP, PK, &forged).valid);
    }

    #[test]
    fn unregistered_key_is_rejected() {
        as_caller(accounts(0));
        let c = BalaBlu::new(accounts(0));
        let r = check(&c, REQ, RESP, PK, SIG);
        assert!(!r.valid);
        assert_eq!(r.reason, "unregistered key");
    }

    #[test]
    fn removed_key_is_rejected() {
        let mut c = setup();
        c.remove_jury_key(PK.into());
        assert!(!check(&c, REQ, RESP, PK, SIG).valid);
    }

    #[test]
    fn key_registered_for_other_model_is_rejected() {
        as_caller(accounts(0));
        let mut c = BalaBlu::new(accounts(0));
        c.register_jury_key("z-ai/glm-5.3-flash".into(), PK.into());
        assert!(!check(&c, REQ, RESP, PK, SIG).valid);
    }

    #[test]
    fn malformed_inputs_do_not_panic() {
        let c = setup();
        assert_eq!(check(&c, REQ, RESP, "zz", SIG).reason, "bad public key");
        assert_eq!(check(&c, REQ, RESP, PK, "abcd").reason, "bad signature encoding");
    }

    #[test]
    #[should_panic(expected = "only owner")]
    fn only_owner_registers_keys() {
        as_caller(accounts(0));
        let mut c = BalaBlu::new(accounts(0));
        as_caller(accounts(1));
        c.register_jury_key(MODEL.into(), PK.into());
    }

    #[test]
    fn binding_parser() {
        assert_eq!(find_binding(b"x BALABLU-AUDIT:42:ab12. y").as_deref(), Some("BALABLU-AUDIT:42:ab12"));
        assert_eq!(find_binding(b"BALABLU-AUDIT:42"), None);
        assert_eq!(find_binding(b"nothing here"), None);
    }
}
