# BalaBlu on X: profile and first posts

Files (made by `node brand/build.mjs`, needs Google Chrome):

| Use | File | Size |
|---|---|---|
| Profile picture | `out/pfp.png` | 800 x 800 (X shows it as a circle) |
| Cover photo | `out/cover.png` | 1500 x 500 |
| Welcome post image | `out/welcome-post.png` | 1600 x 900 |
| Infographic post image | `out/infographic-post.png` | 1080 x 1350 |

## Profile

**Name:** BalaBlu
**Handle:** @balabluapp
**Website:** https://balabluapp.vercel.app
**Location:** NEAR testnet

**Bio** (pick one):

A (recommended)
```
The encyclopedia where every fact has odds. A jury of sealed AIs settles each claim, and NEAR checks the signatures. Don't get BalaBlu'd. #NEARHackathon
```

B (shorter, more playful)
```
Every fact has odds. Call it FACT or BALABLU. A sealed AI jury rules, NEAR checks the proof. Testnet demo built at #NEARHackathon
```

## Post 1: welcome (pin this one)

Image: `out/welcome-post.png`

```
Hello, world! 👋 Meet Blu, mascot of BalaBlu: the encyclopedia where every fact has odds.

Spot nonsense? Call it BALABLU. Think it's true? Call it FACT.

3 sealed AIs settle it. A @NEARProtocol contract checks their signatures.

Try it: https://balabluapp.vercel.app

#NEARHackathon
```

Alt text for the image:
```
Blu, a speech-bubble mascot with a raised eyebrow, next to the words "Hello, world. Meet Blu." and two buttons, FACT and BALABLU. Text: The encyclopedia where every fact has odds. Now live, testnet demo.
```

## Post 2: infographic

Image: `out/infographic-post.png`

```
Who decides what's true? Nobody has to trust us. 👇

1️⃣ You call it: FACT or BALABLU
2️⃣ 3 sealed AIs vote
3️⃣ Every vote is signed
4️⃣ NEAR checks the signatures, then pays winners

54/54 attack checks passed. Verify any audit: https://balabluapp.vercel.app/docs

#NEARHackathon
```

Alt text for the image:
```
Infographic titled "Who decides what's true?" with four steps: 1 You call it, 2 The jury meets, 3 Every vote is signed, 4 NEAR checks the signatures. Below: 3 sealed AI jurors, 54 of 54 attack checks passed, 0 owner backdoors. balabluapp.vercel.app/docs, testnet demo, play money.
```

## Notes
- Every number in the posts is real: 3 jurors (Qwen, DeepSeek, GLM), 54 of 54 attack checks (`data/attacks/RESULTS.md`), and no owner function to settle or pause a claim (checked in the deployed code).
- It is a **testnet demo**: say so if asked. The images say "play money".
- Post the welcome post first and pin it; post the infographic a few hours later, or the next day.
