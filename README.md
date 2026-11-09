# BalaBlu

**The encyclopedia where every fact has odds.** Don't get BalaBlu'd.

Built at **NEAR HACKATHON** (Nov 2026). Work in progress.

- Every claim in BalaBlu has live odds. Call it **FACT** or **BALABLU** (nonsense).
- A jury of 3 AI models running in sealed NEAR AI enclaves settles claims at surprise times.
- **The NEAR smart contract checks each AI juror's enclave signature itself** before paying anyone.

## Status
- [x] On-chain check of NEAR AI Cloud enclave signatures (`contract/`, tested against a real signed reply)
  - Live on testnet: `balabluapp.testnet`. Key registered in tx `3itSKL6gKPJxh6qsabUf2Az85V7rPybHGiRYWu39HQhz`.
  - `check_ai_reply` with the real reply in `contract/fixtures/` returns `valid: true`; change one byte of the response and it returns `signature does not match`.
- [x] Markets: claims, FACT/BALABLU bets (fixed-product market maker), free practice points, USDC wallet (deposit with `ft_transfer_call`, cash out with `withdraw_usdc`), per-bet cap, perpetual epochs, redeem
  - Full loop on testnet: `scripts/testnet-loop.sh` (test USDC with free mint at `usdc.balabluapp.testnet`)
  - Example run: player bet 2 USDC on BALABLU at 30% odds, the claim was settled BALABLU, player redeemed 2.587859 USDC; a 3 USDC bet was refused by the cap; a second redeem was refused; the next epoch opened at 10%.
- [x] Audits by the AI jury, appeals, page anchors
  - The contract writes the jury's question itself (claim + rule + evidence quotes stored on-chain). `submit_votes` is open to anyone, but the contract checks each enclave signature, that the signed request is exactly that question at temperature 0, the model lists, one vote per model, and the verdicts.
  - Jury: `Qwen/Qwen3.8-27B`, `deepseek-ai/DeepSeek-V4.1-Flash-1017`, `z-ai/glm-5.3-flash` (NEAR AI enclaves). Appeal panel adds `moonshotai/kimi-k2.6` and `z-ai/glm-5.3` (attested third-party providers, signed by the NEAR AI gateway enclave).
  - Testnet audit #1 (`node workers/demo-audit.mjs`): claim "NEAR mainnet launched in 2018." with a real source and a prompt-injection source. Jury 3-0 BALABLU ([tx](https://testnet.nearblocks.io/txns/AsouyZRSxCKWfZMjFTMn7ARXuVpsRkbhA8Q8yoWEhYWY)), appeal, panel 5-0 BALABLU ([tx](https://testnet.nearblocks.io/txns/8ZmkYVG332Za1k21RjKhxgQw8Uda5zfHh7TTmHD8Uun2)), finalized and paid ([tx](https://testnet.nearblocks.io/txns/CrD48vs5EGK9mQ1NkYKVNDMH85cpDDKwC5ACBhW27noQ)). Signed replies are in `data/audits-first-deploy/`, attestation reports in `data/attestations/`. The same votes replay in the contract's unit tests.
  - Page writer anchored "NEAR Protocol" v1 ([tx](https://testnet.nearblocks.io/txns/Cw2omEnbn3hoUswQ3uFqe8YeYAtV8geR68v9UhUxonxj)).
- [x] Ask Blu backend (`node workers/askblu.mjs "question"`): answers from claims + odds + jury verdicts; unknown questions become a suggested new claim.
- [x] Web app (`web/`): home, encyclopedia pages (claims highlighted by odds, tap to call), claim pages (rule, evidence, audits, bets, duel, share, watch), live jury show with **in-browser signature verification**, Daily Bla, Ask Blu, Me (calls, truth score, badges, watchlist), money (wallet, test USDC, cash out, any-coin quotes via NEAR Intents)
  - No wallet needed to start: guests get practice points; a relayer with a restricted function-call key signs their practice bets (the contract only lets it touch `*.guest` practice balances)
  - Real money: NEAR Wallet Selector (Meteor, MyNearWallet), USDC bets capped at $2
- [ ] NEAR Intents deposits on mainnet

## Run the web app locally
```bash
node web/dev.mjs          # http://localhost:3000, no npm install needed
```
`.env` in the repo root (never committed) holds `NEAR_AI_API_KEY`, `RELAYER_ACCOUNT`, `RELAYER_PRIVATE_KEY`.

**Deploy on Vercel:** import the repo, set **Root Directory = `web`**, no build command, and add the same three environment variables (plus `NEAR_NETWORK=testnet`, `BALABLU_CONTRACT=balabluapp.testnet`).

## Contract
Built and tested by GitHub Actions (`.github/workflows/contract.yml`). Locally:

```bash
cd contract && cargo test
```

## AI and libraries used
Code written with help from Claude (Anthropic). Libraries: near-sdk, hex (contract); Preact + htm (vendored, web); NEAR Wallet Selector (loaded from esm.sh when connecting a wallet). Fonts: Bricolage Grotesque, Source Serif 4, JetBrains Mono (Google Fonts).

License: MIT
