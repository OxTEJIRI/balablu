#!/usr/bin/env node
// Adds crypto claims to the live testnet encyclopedia (works on a contract that already has content):
// claims + evidence, a few practice bets, real jury audits on five of them, then the AI writes the pages.
//   node workers/seed-crypto.mjs
// Evidence quotes are the team's short summaries of the linked sources (demo content, see the whitepaper).
import { spawnSync } from 'node:child_process';
import { view, call } from './lib/near.mjs';

const ADMIN = 'admin.balabluapp.testnet';
const PLAYER = 'player1.balabluapp.testnet';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label, r) => { console.log(`${r.ok ? '✓' : '✗'} ${label}${r.ok ? '' : `  ${r.error}`}`); return r; };

// [page, text, rule, start odds (bps), audit?, [url, summary]]
const CLAIMS = [
  ['Bitcoin', 'The first Bitcoin block was mined in January 2009.', 'FACT if the first Bitcoin block (the genesis block) was mined in January 2009. BALABLU if in another month or year.', 9000, true,
    ['https://en.bitcoin.it/wiki/Genesis_block', 'The genesis block is the first block of the Bitcoin blockchain. It was mined by Satoshi Nakamoto on 3 January 2009.']],
  ['Ethereum', 'Ethereum moved from proof of work to proof of stake in September 2022.', 'FACT if Ethereum switched its consensus from proof of work to proof of stake in September 2022 (the Merge). BALABLU if in any other month or year.', 8500, true,
    ['https://ethereum.org/en/roadmap/merge/', 'The Merge, when Ethereum switched from proof of work to proof of stake, happened on 15 September 2022.']],
  ['Ethereum', 'Ethereum has a fixed maximum supply of 21 million coins.', 'FACT if the Ethereum protocol caps total ether at 21 million. BALABLU if there is no such cap.', 2500, true,
    ['https://ethereum.org/en/developers/docs/intro-to-ether/', 'Unlike Bitcoin, which is capped at 21 million coins, ether has no fixed maximum supply. New ether is issued to validators and some is burned with every transaction.']],
  ['Solana', 'Solana is a proof-of-work blockchain.', 'FACT if Solana secures its network with proof-of-work mining. BALABLU if it uses another method.', 3000, true,
    ['https://solana.com/docs/core/', 'Solana uses proof of stake for consensus, combined with a clock mechanism called proof of history. It does not use proof-of-work mining.']],
  ['NEAR Protocol', 'NEAR uses a sharded design called Nightshade.', 'FACT if the NEAR protocol splits its work across shards in a design named Nightshade. BALABLU otherwise.', 8000, false,
    ['https://near.org/papers/nightshade', 'Nightshade is the name of NEAR’s sharding design: the network splits its work across shards that each produce a part of every block.']],
  ['NEAR Protocol', 'NEAR Intents lets people swap coins across different blockchains.', 'FACT if NEAR Intents supports swaps between coins that live on different blockchains. BALABLU otherwise.', 8500, false,
    ['https://docs.near-intents.org/', 'NEAR Intents is a cross-chain swap system: a user states what they want and solvers compete to fill it, across chains such as Solana, Ethereum and Bitcoin.']],
  ['Crypto Basics', 'A crypto wallet app stores your coins inside the app.', 'FACT if the coins are stored inside the wallet app itself. BALABLU if the coins live on the blockchain and the wallet only holds the keys.', 3500, true,
    ['https://ethereum.org/en/wallets/', 'Wallets do not hold your funds. Your coins live on the blockchain, and the wallet holds the keys that let you move them.']],
  ['Crypto Basics', 'A crypto payment sent to the wrong address can usually be undone.', 'FACT if a confirmed payment to a wrong address can usually be reversed by asking someone. BALABLU if confirmed payments are normally irreversible.', 2000, false,
    ['https://en.bitcoin.it/wiki/Irreversible_transactions', 'Bitcoin transactions are irreversible once confirmed. There is no central party that can undo a payment that was sent to the wrong address.']],
  ['Dogecoin', 'Dogecoin was created as a joke in 2013.', 'FACT if Dogecoin was launched in 2013 as a joke based on a meme. BALABLU otherwise.', 8800, false,
    ['https://en.wikipedia.org/wiki/Dogecoin', 'Dogecoin was created in December 2013 by Billy Markus and Jackson Palmer as a joke, based on the Doge meme.']],
];

const ids = [];
for (const [page, text, rule, odds, , [url, quote]] of CLAIMS) {
  const r = ok(`claim: ${text}`, call('create_claim', { page, text, rule, sources: [url], fact_odds_bps: odds, usdc_seed: '0' }, ADMIN, { gas: '50 Tgas' }));
  if (!r.ok) process.exit(2);
  const id = Number(r.value);
  ids.push(id);
  ok(`  evidence ${url}`, call('add_evidence', { claim_id: id, url, quote }, PLAYER, { deposit: '0.01 NEAR', gas: '30 Tgas' }));
}

for (const [i, side, pts] of [[0, 'Fact', 90], [2, 'Balablu', 120], [3, 'Balablu', 60], [6, 'Balablu', 150], [7, 'Balablu', 70], [8, 'Fact', 40]]) {
  call('buy', { claim_id: ids[i], side, currency: 'Points', amount: String(pts * 1_000_000) }, PLAYER, { gas: '30 Tgas' });
}
console.log('✓ practice bets placed');

const audits = [];
for (let i = 0; i < CLAIMS.length; i++) {
  if (!CLAIMS[i][4]) continue;
  const r = ok(`audit request: ${CLAIMS[i][1]}`, call('request_audit', { claim_id: ids[i] }, ADMIN, { gas: '50 Tgas' }));
  if (!r.ok) continue;
  const a = Number(r.value);
  audits.push(a);
  spawnSync(process.execPath, ['workers/jury.mjs', String(a), '--signer', ADMIN], { stdio: 'inherit' });
}

const cfg = await view('get_config');
console.log(`\nwaiting ${Math.round(cfg.appeal_window_ms / 1000)} s for the appeal windows…`);
await sleep(cfg.appeal_window_ms + 12_000);
for (const a of audits) ok(`finalize audit #${a}`, call('finalize', { audit_id: a }, PLAYER, { gas: '100 Tgas' }));

for (const page of ['Bitcoin', 'Ethereum', 'Solana', 'NEAR Protocol', 'Crypto Basics', 'Dogecoin']) {
  spawnSync(process.execPath, ['workers/writer.mjs', page, '--signer', ADMIN], { stdio: ['inherit', 'ignore', 'inherit'] });
  const anchor = await view('get_page_anchor', { page });
  console.log(`${anchor ? '✓' : '✗'} page "${page}" ${anchor ? `v${anchor.version} anchored` : 'not anchored'}`);
}
console.log('\ncrypto seed done');
