# BalaBlu

**The encyclopedia where every fact has odds.** Don't get BalaBlu'd.

Built at **NEAR HACKATHON** (Nov 2026). Work in progress.

- Every claim in BalaBlu has live odds. Call it **FACT** or **BALABLU** (nonsense).
- A jury of 3 AI models running in sealed NEAR AI enclaves settles claims at surprise times.
- **The NEAR smart contract checks each AI juror's enclave signature itself** before paying anyone.

## Status
- [x] On-chain check of NEAR AI Cloud enclave signatures (`contract/`, tested against a real signed reply)
- [ ] Markets, practice mode, audits, appeals
- [ ] Web app, Ask Blu, NEAR Intents deposits

## Contract
Built and tested by GitHub Actions (`.github/workflows/contract.yml`). Locally:

```bash
cd contract && cargo test
```

## AI and libraries used
Code written with help from Claude (Anthropic). Libraries: near-sdk, hex.

License: MIT
