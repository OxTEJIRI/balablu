# BalaBlu

**The encyclopedia where every fact has odds.** Don't get BalaBlu'd.

Built at **NEAR HACKATHON** (Nov 2026). Testnet release. Live app: **https://balabluapp.vercel.app** · Whitepaper: [/docs](https://balabluapp.vercel.app/docs) · X: [@balabluapp](https://x.com/balabluapp)

Read a page. If a sentence smells like nonsense, call it **BALABLU**. If it holds up, call it **FACT**. Play with free practice points (no wallet) or a few USDC. Every so often a **jury of three AI models, each running inside a sealed NEAR AI enclave**, reads the evidence and votes. Each vote is signed by the enclave, and **the NEAR smart contract checks the signatures itself** before it pays anyone. Pages rewrite themselves from the odds, and every claim stays open for the next round.

## The problem
Confident nonsense is free: being wrong costs nothing, chatbots sound sure even when facts are contested, prediction markets are for experts and close after one result, and whoever resolves a market can be bribed or be wrong. BalaBlu puts odds on facts for everyone, and makes the judge a sealed jury that **cannot be rigged, even by us**.

## Try it (2 minutes, no wallet)
1. Open https://balabluapp.vercel.app and press **Play today's Daily Bla**. You get 1,000 free points; each call settles into live odds. Then open **My bets**: every bet you make (home page, Daily Bla, claim pages) is listed there with a plain status, and you can collect winnings or cash out early.
2. Open **Encyclopedia → Great Wall**. The struck-through sentence was **BalaBlu'd by the jury**. Tap any highlighted sentence to call it.
3. Open the red **Got BalaBlu'd** cards on the home page → **Verify it yourself**. Your browser re-hashes the signed files and re-checks each enclave signature, with no trust in us.
4. **Ask Blu**: "How many hearts does an octopus have?" Ask something new and Blu proposes a claim you can put up for betting.
5. **Paste a link**: drop in a Wikipedia article and Blu extracts claims to bet on.
6. Want real (test) money? **Use real money** → connect Meteor or MyNearWallet (testnet) → *Get 10 test USDC*.

## How it works
- **Claim:** one checkable sentence + a rule ("FACT if X, BALABLU otherwise") + sources, stored on NEAR. Anyone can add evidence (0.01 NEAR deposit), frozen once an audit starts.
- **Odds:** a fixed-product market maker per claim (integer maths, rounding favours the pool). Price of FACT = BALABLU pool ÷ (FACT pool + BALABLU pool). Practice points or USDC; USDC bets capped at $2.
- **Audits:** surprise (keeper + NEAR's on-chain random seed, rate-limited) or requested (0.5 USDC). Betting pauses while the jury works.
- **Jury:** the **contract writes the question itself**. Three models (`Qwen/Qwen3.8-27B`, `deepseek-ai/DeepSeek-V4.1-Flash-1017`, `z-ai/glm-5.3-flash`) answer inside NEAR AI enclaves. `submit_votes` is open to anyone, but the contract verifies: the enclave signature, that the signed request is *exactly* its question at temperature 0, the model list, one vote per model, and every model voted.
- **Appeals:** 2 USDC bond → panel of five (adds `moonshotai/kimi-k2.6`, `z-ai/glm-5.3`, signed by the NEAR AI gateway enclave) → council window → anyone finalizes.
- **Perpetual:** a new round opens near each verdict. Pages are AI-written from the odds, signed, and **anchored on-chain** by version.
- **Evidence rewards:** half of a requested audit's fee is shared between the accounts whose sources the jury read.

Full detail, economics and limits: the [whitepaper](web/content/whitepaper.md) (also at `/docs` in the app).

## Proofs (all reproducible)
| What | Where |
|---|---|
| **54/54 attack checks** against a live testnet copy: genuine enclave signatures on a *rigged* question refused; whale + prompt-injection could not move three jurors; forged/edited/swapped/replayed votes refused; no owner backdoor; money conserved to the unit | [`data/attacks/RESULTS.md`](data/attacks/RESULTS.md), `node workers/attack-suite.mjs` |
| Real jury audits on the live contract (signed files + attestation reports). **Re-check any of them yourself:** `node scripts/verify-audit.mjs <id>` compares the committed files with what the contract stored on-chain (hashes, enclave signatures, binding line, verdicts, majority) | [`data/audits/`](data/audits), [`data/attestations/`](data/attestations), [`scripts/verify-audit.mjs`](scripts/verify-audit.mjs) |
| The first deployment's audits (3-0, then a 5-0 appeal). That deployment's chain state was later reset, so these verify through their [transactions](https://testnet.nearblocks.io/txns/AsouyZRSxCKWfZMjFTMn7ARXuVpsRkbhA8Q8yoWEhYWY), not against today's contract | [`data/audits-first-deploy/`](data/audits-first-deploy) |
| The same real signed votes replay in the contract's unit tests (tamper, replay, duplicates) | `contract/src/tests.rs`, `contract/fixtures/` |
| AI-written pages anchored on-chain, re-checked in your browser | `data/pages/`, claim "✓ page signature anchored on NEAR" |
| Contract | `balabluapp.testnet` ([explorer](https://testnet.nearblocks.io/address/balabluapp.testnet)); CI builds and tests it on every push |

## Features
Fact-or-BalaBlu bets with a clear "your bet is in" receipt · practice mode (no wallet) · **My bets**: every bet with a plain status, collect winnings, cash out early, history, truth score and badges · live jury show with in-browser verification · Ask Blu · paste-a-link claim finder · Daily Bla with streaks · watchlist with move alerts · duel a friend · share cards (PNG) · live odds badge and iframe embed · Explain-like-I'm-5 (pre-written, instant) · evidence rewards · crypto claim pages · live any-coin price quotes via NEAR Intents · **odds API + MCP server for AI agents** (`/api/v1/odds`, `/api/mcp`, `/llms.txt`) · whitepaper and roadmap in the app.

## Run it yourself
```bash
git clone https://github.com/OxTEJIRI/balablu && cd balablu
node web/dev.mjs                      # http://localhost:3000, no npm install (Node 20+)
cd contract && cargo test --workspace # unit tests (also run by GitHub Actions)
node workers/attack-suite.mjs         # attacks a live testnet copy; needs NEAR CLI + .env
```
`.env` in the repo root (never committed): `NEAR_AI_API_KEY`, `RELAYER_ACCOUNT`, `RELAYER_PRIVATE_KEY`. **Deploy on Vercel:** import the repo, **Root Directory = `web`**, no build command, add those variables plus `NEAR_NETWORK=testnet` and `BALABLU_CONTRACT=balabluapp.testnet`.

Other scripts: `scripts/testnet-loop.sh` (money loop), `workers/seed.mjs` / `workers/seed-crypto.mjs` (content), `workers/jury.mjs`, `workers/keeper.mjs`, `workers/writer.mjs`, `workers/eli5.mjs`.

## For judges and AI reviewers
Start with [`JUDGES.md`](JUDGES.md): a 5-minute path to verify the central claim without trusting us, a map from every README claim to its evidence, what is real vs demo content, and the known limits. Live state for scripts and agents: `GET /api/status`.

## Honest limits
- **Testnet only.** Play money; the contract is not independently audited. Mainnet (with the built-in $2 caps) is the next step, not done.
- **Real-money deposits in any coin need NEAR Intents, which has no testnet.** The app shows live mainnet quotes; deposits and cash-outs in any coin are on the roadmap.
- AI jurors can be wrong; three models plus appeals reduce, not remove, that. The council is the project owner today (DAO planned). The guest relayer is centralised but can only touch practice points. The keeper is a script (scheduled keeper planned). Enclave attestations are checked off-chain before keys are registered.
- Demo claims, rules and source summaries on testnet were written by the team from the linked sources.

## Roadmap
`balablu.app` domain · mainnet launch with caps · scheduled keeper · leaderboard (needs an indexer) · any-coin deposits and cash-outs via NEAR Intents · open claim creation with bonds · DAO council · on-chain attestation checks · rotating, more varied jurors · X bot ("@balabluapp is this true?") · browser extension · confidential bets (Intents confidential swaps) · mobile app and more languages. Details in the whitepaper.

## AI and libraries used
Code written with help from Claude (Anthropic). The jury, page writer, Ask Blu, claim extractor and ELI5 run on **NEAR AI Cloud** (open-weight models in enclaves). Libraries: near-sdk, hex (contract); Preact + htm (vendored, web); NEAR Wallet Selector (loaded from esm.sh on wallet connect). Fonts: Bricolage Grotesque, Source Serif 4, JetBrains Mono. Built Nov 9–14, 2026.

License: MIT
