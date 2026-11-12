# Guide for judges and AI reviewers

BalaBlu is an encyclopedia where every fact has live odds. A jury of three AI models running in sealed NEAR AI enclaves settles claims, and **a NEAR smart contract verifies the enclaves' signatures itself** before paying anyone. This page gets you to a verdict on that claim in a few minutes, with commands you can run.

- Live app: https://balabluapp.vercel.app (testnet demo, play money)
- Live status (JSON): https://balabluapp.vercel.app/api/status
- Contract: `balabluapp.testnet` ([explorer](https://testnet.nearblocks.io/address/balabluapp.testnet))
- Whitepaper: https://balabluapp.vercel.app/docs (raw: [`web/content/whitepaper.md`](web/content/whitepaper.md))

## 60 seconds: look at it
1. Open the live app, press **Play today's Daily Bla** (no wallet, 1,000 free points), then open **My bets**.
2. Open **Encyclopedia → The Great Wall**. The struck-through sentence was ruled **BalaBlu** by the jury.
3. On any red "Got BalaBlu'd" card press **Verify it yourself**: your browser re-hashes the signed files and re-checks each enclave signature.

## 5 minutes: verify without trusting us
You need Node 20+ (no `npm install`).
```bash
git clone https://github.com/OxTEJIRI/balablu && cd balablu
node scripts/verify-audit.mjs 0        # re-checks audit #0 against the chain: hashes, ed25519 signatures, binding line, verdicts, majority
node scripts/verify-audit.mjs 7        # an audit from the crypto content
curl -s https://balabluapp.vercel.app/api/status
curl -s "https://balabluapp.vercel.app/api/v1/odds?q=octopus"
```
`verify-audit.mjs` reads the committed signed files in `data/audits/<id>/`, asks the contract for what it stored on-chain, and checks: file hashes = on-chain hashes; the signed text; the enclave's ed25519 signature; the audit binding line and temperature 0; each verdict; the majority vs the outcome. It exits non-zero on any mismatch. (`data/audits-first-deploy/` is from an earlier deployment whose chain state was reset, so it intentionally does not verify against the current contract; the tool says so.)

## Unit tests and the attack suite
```bash
cd contract && cargo test --workspace      # also run by GitHub Actions on every push (see the Actions tab)
node workers/attack-suite.mjs              # 54 attacks on a live testnet copy; needs the NEAR CLI and .env (see README)
```
The results of a full run are committed: [`data/attacks/RESULTS.md`](data/attacks/RESULTS.md) (54 of 54 pass), including **genuine enclave signatures on a rigged question being refused** and a whale + prompt-injection that did not move three jurors.

## Where each claim in the README is proven
| Claim | Evidence |
|---|---|
| The contract verifies AI signatures itself | `contract/src/jury.rs` (`verify`, `check_jury_request`), `contract/src/lib.rs` (`submit_votes`); unit tests replay real signed votes (`contract/src/tests.rs`, `contract/fixtures/`) |
| The contract writes the jury's question | `get_jury_prompt` view; `submit_votes` rejects any other signed question |
| No owner backdoor to settle or pause | the deployed wasm has no such function (checked by the attack suite via `view_code`) |
| Real AI audits happened on-chain | `data/audits/`, `data/attestations/`, transactions linked in `README.md` |
| AI-written pages are anchored | `anchor_page` in the contract; each wiki page shows "page signature anchored on NEAR", re-checked in the browser |
| Money is conserved | attack-suite check "no USDC created or destroyed" (0 units of difference) |
| Real wallet flow works | Meteor wallet (testnet): connect, mint+deposit test USDC, bet, cash out (see My bets) |
| Agent-friendly | `/api/v1/odds`, `/api/mcp` (MCP over HTTP), `/api/status`, `/llms.txt`, `/sitemap.xml` |

## What is real, and what is demo content (please read)
- **Real:** the contract, the enclave signatures and attestation reports, the jury runs, the on-chain anchors, the market maths, the guest relayer, the wallet flow, the live NEAR Intents price quotes.
- **Demo content:** the claims, their rules, and the evidence quotes on testnet were written by the team from the linked sources (the quotes are short paraphrases). They exist to demonstrate the mechanism. We are not offering them as authoritative fact-checking.
- **Testnet only.** Practice points and test USDC have no value. The contract is not independently audited. Mainnet (with built-in $2 caps) is future work.

## Known limits (we would rather you hear them from us)
- AI jurors can be wrong. Three models plus appeals reduce that; they do not remove it.
- Enclave attestation reports are checked off-chain before keys are registered; on-chain attestation checks are on the roadmap.
- The council is the project owner today (a DAO is planned). The guest relayer is centralised but can only touch practice points. The keeper (surprise audits) is a script, not yet scheduled.
- NEAR Intents has no testnet, so any-coin deposits are shown as live mainnet quotes only.
- Some test claims from our own attack runs exist on-chain; the app hides them.

## Hackathon requirements, in one place
| Requirement | Where |
|---|---|
| Public repo, unique, MIT license | this repository, [`LICENSE`](LICENSE) |
| Reproducible README ("do X, see Y") | [`README.md`](README.md): "Try it", "Run it yourself", "Proofs" |
| Built in the window | Git history: first commit Nov 9, 2026; the whole project was built between Nov 9 and Nov 14 |
| AI-generated code and libraries listed | README: "AI and libraries used" (code written with Claude; jury and features run on NEAR AI Cloud) |
| Uses NEAR AI and NEAR Intents | NEAR AI Cloud: jury, page writer, Ask Blu, claim extractor. NEAR Intents: live any-coin quotes (mainnet only). NEAR: the contract. |
| Demo post on X | linked from the submission form (posted from the founder's account) |
