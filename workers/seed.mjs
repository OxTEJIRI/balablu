#!/usr/bin/env node
// Seed testnet with real encyclopedia content: claims (with rules), evidence,
// some practice bets, five real jury audits, and AI-written pages.
//   node workers/seed.mjs            (after a fresh deploy + reinit)
import { spawnSync } from 'node:child_process';
import { view, call, CONTRACT } from './lib/near.mjs';

const ADMIN = 'admin.balabluapp.testnet';
const PLAYER = 'player1.balabluapp.testnet';
const RELAYER = 'balablu-relay.testnet';
const USDC = 'usdc.balabluapp.testnet';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label, r) => {
  console.log(`${r.ok ? '✓' : '✗'} ${label}${r.ok ? '' : `  ${r.error}`}`);
  return r;
};

// [page, text, rule, start odds (bps), usdc seed, audit?, evidence [[url, quote]]]
const CLAIMS = [
  ['NEAR Protocol', 'NEAR mainnet launched in 2018.', 'FACT if NEAR mainnet produced its first block in 2018. BALABLU if mainnet started in another year.', 3000, 5, true,
    [['https://near.org/blog/near-mainnet-genesis', 'NEAR mainnet genesis: the first block of NEAR mainnet was produced on April 22, 2020, in "Phase 0", run by the NEAR Foundation.']]],
  ['NEAR Protocol', 'NEAR co-founder Illia Polosukhin co-wrote the 2017 paper that introduced the Transformer.', 'FACT if Illia Polosukhin is listed as an author of "Attention Is All You Need" (2017). BALABLU if he is not.', 8500, 5, true,
    [['https://arxiv.org/abs/1706.03762', 'Attention Is All You Need (2017). Authors: Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, Illia Polosukhin.']]],
  ['NEAR Protocol', 'NEAR became community-governed in October 2020.', 'FACT if NEAR validators voted the network into its community-governed phase (token transfers on) in October 2020. BALABLU if that happened in another month or never.', 8000, 0, false,
    [['https://near.org/blog/near-mainnet-is-now-community-operated', 'In October 2020 NEAR validators voted to move mainnet into Phase II, enabling token transfers and making the network fully community-governed.']]],
  ['NEAR Protocol', 'NEAR Intents has processed more than $10 billion in swaps.', 'FACT if the public NEAR Intents explorer shows more than $10 billion of cumulative swap volume. BALABLU if it shows less.', 5500, 5, false, []],
  ['The Great Wall', 'You can see the Great Wall of China from the Moon with your naked eye.', 'FACT if a person standing on the Moon can see the Great Wall without a telescope or camera zoom. BALABLU if they cannot.', 3500, 0, true,
    [['https://www.nasa.gov/image-article/great-wall/', 'NASA: The Great Wall of China, frequently billed as the only human-made object visible from space, generally is not, at least to the unaided eye in low Earth orbit. It is certainly not visible from the Moon.']]],
  ['The Great Wall', "The Great Wall's sections add up to more than 20,000 km.", 'FACT if official surveys put the total length of all Great Wall sections above 20,000 km. BALABLU if below.', 7800, 0, false,
    [['https://en.wikipedia.org/wiki/Great_Wall_of_China', "A 2012 archaeological survey by China's State Administration of Cultural Heritage found that all sections of the Great Wall measure 21,196 km."]]],
  ['Octopus', 'An octopus has three hearts.', 'FACT if a typical octopus has three hearts (two branchial, one systemic). BALABLU if it has another number.', 8800, 0, true,
    [['https://ocean.si.edu/ocean-life/invertebrates/octopuses', 'Octopuses have three hearts: two pump blood through the gills and one pumps it around the rest of the body.']]],
  ['Octopus', 'Octopus blood is blue.', 'FACT if octopus blood is blue because it uses copper-based hemocyanin. BALABLU if it is another colour.', 8400, 0, false, []],
  ['Goldfish', 'Goldfish only remember things for three seconds.', 'FACT if studies show goldfish memory lasts about three seconds. BALABLU if studies show they remember for much longer.', 2600, 0, false,
    [['https://www.bbc.co.uk/news/science-environment-28066453', 'Researchers trained goldfish to respond to sounds and lights and found they remembered the training for months, not seconds.']]],
  ['Lightning', 'Lightning never strikes the same place twice.', 'FACT if lightning cannot strike the same spot more than once. BALABLU if the same spot can be struck many times.', 2200, 0, true,
    [['https://www.weather.gov/safety/lightning-myths', 'Myth: Lightning never strikes the same place twice. Fact: Lightning often strikes the same place repeatedly. The Empire State Building is hit about 23 times a year.']]],
  ['Bitcoin', "Bitcoin's new supply is cut in half about every four years.", 'FACT if the block reward halves every 210,000 blocks (about every four years). BALABLU otherwise.', 9000, 5, false,
    [['https://bitcoin.org/bitcoin.pdf', 'Bitcoin block rewards halve every 210,000 blocks, which takes roughly four years.']]],
  ['Bitcoin', 'There will never be more than 21 million bitcoin.', 'FACT if the Bitcoin protocol caps total supply at 21 million coins. BALABLU if it does not.', 9300, 0, false, []],
  ['Honey', 'Honey found in ancient Egyptian tombs was still edible.', 'FACT if archaeologists have found honey thousands of years old in Egyptian tombs that was still edible. BALABLU if not.', 7200, 0, false,
    [['https://www.smithsonianmag.com/science-nature/the-science-behind-honeys-eternal-shelf-life-1218690/', 'Archaeologists excavating ancient Egyptian tombs have often found pots of honey, thousands of years old, still preserved and edible.']]],
  ['Honey', 'Bees visit about two million flowers to make one pound of honey.', 'FACT if beekeeping bodies estimate around two million flower visits per pound of honey. BALABLU if the estimate is far off.', 6100, 0, false, []],
  ['Lagos', 'Lagos has more than 20 million residents.', 'FACT if a credible current estimate puts the Lagos metropolitan population above 20 million. BALABLU if credible estimates are below.', 5800, 0, false, []],
  ['Eiffel Tower', 'The Eiffel Tower is taller than 300 metres.', 'FACT if the Eiffel Tower is more than 300 m tall including its antennas. BALABLU if not.', 9000, 0, false,
    [['https://www.toureiffel.paris/en/the-monument/key-figures', 'The Eiffel Tower is 330 metres tall, including its antennas.']]],
];

if ((await view('claims_count')) !== 0) {
  console.error('contract already has claims; deploy + reinit first');
  process.exit(1);
}

const cfg = await view('get_config');
Object.assign(cfg, { keeper: ADMIN, council: ADMIN, relayer: RELAYER, appeal_window_ms: 180_000, jury_timeout_ms: 30 * 60_000, roll_interval_ms: 60 * 60_000 });
ok('config (relayer, keeper, 3-min appeal window for testnet)', call('set_config', { config: cfg }, ADMIN, { gas: '30 Tgas' }));

ok('mint 60 test USDC to admin', call('mint', { account_id: ADMIN, amount: '60000000' }, ADMIN, { contract: USDC, gas: '30 Tgas' }));
ok('admin deposits 60 USDC', call('ft_transfer_call', { receiver_id: CONTRACT, amount: '60000000', msg: '' }, ADMIN, { contract: USDC, deposit: '1 yoctoNEAR', gas: '100 Tgas' }));

const ids = [];
for (const [page, text, rule, odds, seed, , evidence] of CLAIMS) {
  const r = call('create_claim', { page, text, rule, sources: evidence.map((e) => e[0]), fact_odds_bps: odds, usdc_seed: String(seed * 1_000_000) }, ADMIN, { gas: '50 Tgas' });
  ok(`claim: ${text}`, r);
  const id = Number(r.value);
  ids.push(id);
  for (const [url, quote] of evidence) ok(`  evidence ${url}`, call('add_evidence', { claim_id: id, url, quote }, PLAYER, { deposit: '0.01 NEAR', gas: '30 Tgas' }));
}

// a few practice bets so odds move and pages have activity
const bets = [[0, 'Balablu', 120], [1, 'Fact', 80], [4, 'Balablu', 150], [8, 'Balablu', 60], [9, 'Balablu', 90], [14, 'Fact', 40], [3, 'Fact', 70]];
for (const [i, side, pts] of bets) call('buy', { claim_id: ids[i], side, currency: 'Points', amount: String(pts * 1_000_000) }, PLAYER, { gas: '30 Tgas' });
console.log('✓ practice bets placed');

// real audits by the AI jury
const audits = [];
for (let i = 0; i < CLAIMS.length; i++) {
  if (!CLAIMS[i][5]) continue;
  const r = ok(`audit request: ${CLAIMS[i][1]}`, call('request_audit', { claim_id: ids[i] }, ADMIN, { gas: '50 Tgas' }));
  const a = Number(r.value);
  audits.push(a);
  spawnSync(process.execPath, ['workers/jury.mjs', String(a), '--signer', ADMIN], { stdio: 'inherit' });
}

console.log('\nwaiting for the 3-minute appeal windows…');
await sleep(190_000);
for (const a of audits) ok(`finalize audit #${a}`, call('finalize', { audit_id: a }, PLAYER, { gas: '100 Tgas' }));

for (const page of [...new Set(CLAIMS.map((c) => c[0]))]) {
  spawnSync(process.execPath, ['workers/writer.mjs', page, '--signer', ADMIN], { stdio: ['inherit', 'ignore', 'inherit'] });
  const anchor = await view('get_page_anchor', { page });
  console.log(`${anchor ? '✓' : '✗'} page "${page}" ${anchor ? `v${anchor.version} anchored` : 'not anchored'}`);
}
console.log('\nseed done');
