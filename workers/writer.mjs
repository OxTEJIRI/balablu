#!/usr/bin/env node
// Page writer: rewrites an encyclopedia page from the live odds, gets the
// enclave signature, saves the page to data/pages/<slug>/ and anchors the
// version on-chain (keeper only).
//
//   node workers/writer.mjs "NEAR Protocol" [--signer admin.balabluapp.testnet] [--dry]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { view, call, explorer } from './lib/near.mjs';
import { chatExact, fetchSignature, checkSigned } from './lib/nearai.mjs';
import { claimsWithOdds, describe, slug } from './lib/pages.mjs';

const args = process.argv.slice(2);
const page = args[0];
const signer = args.includes('--signer') ? args[args.indexOf('--signer') + 1] : process.env.BALABLU_SIGNER || 'admin.balabluapp.testnet';
const dry = args.includes('--dry');
const MODEL = process.env.WRITER_MODEL || 'Qwen/Qwen3.8-27B';
if (!page) {
  console.error('usage: node workers/writer.mjs "<page name>" [--signer acct] [--dry]');
  process.exit(1);
}

const s = slug(page);
const claims = (await claimsWithOdds()).filter((c) => slug(c.page) === s);
if (!claims.length) throw new Error(`no claims on page "${page}"`);
const prev = await view('get_page_anchor', { page });
const version = (prev?.version || 0) + 1;
const tag = `BALABLU-PAGE:${version}:${s}`;

const system = `You write pages for BalaBlu, a friendly encyclopedia where every sentence has odds. \
Write for people who are new to crypto: short sentences, plain words. \
Use ONLY the claims given. State claims with high odds plainly, hedge claims near 50% ("people disagree whether…"), \
and say clearly when a claim was BalaBlu'd (shown to be false). After each sentence that uses a claim, add its id like [#3]. \
Output Markdown: a one-line intro, then 2-4 short sections with ## headings. No preamble.`;
const user = `${tag}\nPAGE: ${page}\nCLAIMS (odds = how sure bettors are it is a FACT):\n${claims.map(describe).join('\n')}`;

let res;
let md = '';
for (const maxTokens of [6000, 12000]) {
  res = await chatExact({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: maxTokens, stream: false });
  md = String(res.json.choices?.[0]?.message?.content || '').replace(/^[\s\S]*<\/think>/, '').trim();
  if (md) break;
  console.log(`(no text, finish_reason=${res.json.choices?.[0]?.finish_reason}; retrying with more tokens)`);
}
if (!md) throw new Error('writer returned no text');
const sig = await fetchSignature(res.json.id, MODEL);
const chk = checkSigned(sig, res.requestBytes, res.responseBytes);
if (!chk.ok) throw new Error(chk.why);

const dir = join('data', 'pages', s);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `v${version}.md`), `# ${page}\n\n${md}\n`);
writeFileSync(join(dir, `v${version}.request.json`), res.requestBytes);
writeFileSync(join(dir, `v${version}.response.json`), res.responseBytes);
writeFileSync(join(dir, `v${version}.signature.json`), JSON.stringify(sig, null, 2));
console.log(`# ${page} (v${version})\n\n${md}\n`);

if (dry) process.exit(0);
const reply = { request: res.requestBytes.toString('base64'), response: res.responseBytes.toString('base64'), public_key_hex: sig.signing_address, signature_hex: sig.signature };
const r = call('anchor_page', { page, version, reply }, signer, { gas: '100 Tgas' });
if (!r.ok) {
  console.error(`anchor failed: ${r.error}`);
  process.exit(2);
}
console.log(`anchored v${version}: ${explorer(r.tx)}`);
writeFileSync(join(dir, `v${version}.anchor.json`), JSON.stringify({ tx: r.tx }, null, 2));
