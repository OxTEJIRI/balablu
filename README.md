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
- [ ] Audits by the AI jury, appeals
- [ ] Web app, Ask Blu, NEAR Intents deposits

## Contract
Built and tested by GitHub Actions (`.github/workflows/contract.yml`). Locally:

```bash
cd contract && cargo test
```

## AI and libraries used
Code written with help from Claude (Anthropic). Libraries: near-sdk, hex.

License: MIT
