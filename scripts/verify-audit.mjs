#!/usr/bin/env node
// Independently verify a BalaBlu jury audit. No dependencies, Node 20+.
//
//   node scripts/verify-audit.mjs <audit id>
//   node scripts/verify-audit.mjs 1 --data data/audits-first-deploy        (the very first audit)
//   node scripts/verify-audit.mjs 1 --contract balablu-attacks.testnet --data data/attack-instance/audits
//
// For every juror vote it checks, against what NEAR stores on-chain:
//   1. the saved request/response files hash to the hashes the contract recorded
//   2. the signed text is exactly "<model>:<sha256 request>:<sha256 response>" (or "<req>:<resp>" for gateway-signed models)
//   3. the enclave's ed25519 signature over that text is valid
//   4. the request carries this audit's binding line (audit id, round, evidence root) and temperature 0
//   5. the verdict inside the response equals the verdict the contract stored
// and finally that the majority of the recorded votes equals the audit's outcome.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const id = Number(args[0]);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const CONTRACT = opt('--contract', 'balabluapp.testnet');
const DATA = opt('--data', 'data/audits');
const RPC = opt('--rpc', 'https://test.rpc.fastnear.com');
if (!Number.isInteger(id)) {
  console.error('usage: node scripts/verify-audit.mjs <audit id> [--data dir] [--contract account] [--rpc url]');
  process.exit(1);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const slug = (m) => m.replace(/[^A-Za-z0-9.-]+/g, '_');
const spki = (hex) => createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });

async function view(method, argsObj) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: CONTRACT, method_name: method, args_base64: Buffer.from(JSON.stringify(argsObj)).toString('base64') } }) });
  const j = await r.json();
  if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error || j.result.error));
  return JSON.parse(Buffer.from(j.result.result).toString());
}

function readVerdict(responseJson) {
  const content = responseJson?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;
  let start = content.lastIndexOf('{"verdict"');
  if (start < 0) start = content.indexOf('{');
  for (let end = content.length; end > start && start >= 0; end--) {
    try {
      const v = String(JSON.parse(content.slice(start, end)).verdict || '').trim().toUpperCase();
      return { FACT: 'Fact', BALABLU: 'Balablu', UNSURE: 'Unsure' }[v] || null;
    } catch { /* shrink */ }
  }
  return null;
}

const audit = await view('get_audit', { audit_id: id });
if (!audit) { console.error(`audit ${id} does not exist on ${CONTRACT}`); process.exit(1); }
const claim = await view('get_claim', { claim_id: audit.claim_id });
console.log(`Audit #${id} on ${CONTRACT}: ${audit.status}, outcome ${audit.outcome}`);
console.log(`Claim #${claim.id}: "${claim.text}"`);
console.log(`Evidence root (on-chain): ${audit.evidence_root}\n`);

let allOk = true;
const check = (ok, label) => { console.log(`    ${ok ? '✓' : '✗'} ${label}`); if (!ok) allOk = false; return ok; };

for (const v of audit.votes) {
  console.log(`  Round ${v.round} · ${v.model} · stored verdict ${v.verdict}`);
  const base = join(DATA, String(id), `r${v.round}`, slug(v.model));
  if (![`${base}.request.json`, `${base}.response.json`, `${base}.signature.json`].every(existsSync)) {
    check(false, `signed files not found at ${base}.*`);
    continue;
  }
  const reqBytes = readFileSync(`${base}.request.json`);
  const respBytes = readFileSync(`${base}.response.json`);
  const sig = JSON.parse(readFileSync(`${base}.signature.json`, 'utf8'));
  const reqHash = sha(reqBytes);
  const respHash = sha(respBytes);
  check(reqHash === v.request_sha256, 'request file hashes to the hash stored on-chain');
  check(respHash === v.response_sha256, 'response file hashes to the hash stored on-chain');
  const expected = sig.signature_kind === 'gateway' ? `${reqHash}:${respHash}` : `${v.model}:${reqHash}:${respHash}`;
  check(sig.text === expected, `signed text is exactly ${sig.signature_kind === 'gateway' ? 'request:response hashes' : 'model:request hash:response hash'}`);
  let sigOk = false;
  try { sigOk = verify(null, Buffer.from(sig.text), spki(sig.signing_address), Buffer.from(sig.signature, 'hex')); } catch { /* invalid key */ }
  check(sigOk, `ed25519 signature is valid (enclave key ${sig.signing_address.slice(0, 12)}…, kind ${sig.signature_kind})`);
  const reqJson = JSON.parse(reqBytes.toString('utf8'));
  const user = reqJson.messages?.[1]?.content || '';
  check(user.startsWith(`BALABLU-AUDIT:${id}-r${v.round}:${audit.evidence_root}`), 'request starts with this audit\'s binding line (id, round, evidence root)');
  check(reqJson.temperature === 0 && !reqJson.stream, 'request used temperature 0, not streamed');
  const said = readVerdict(JSON.parse(respBytes.toString('utf8')));
  check(said === v.verdict, `verdict inside the signed response (${said}) equals the stored verdict`);
}

// majority of the last round decides
const lastRound = Math.max(...audit.votes.map((v) => v.round));
const last = audit.votes.filter((v) => v.round === lastRound);
const n = last.length;
const count = (k) => last.filter((v) => v.verdict === k).length;
const majority = count('Fact') * 2 > n ? 'Fact' : count('Balablu') * 2 > n ? 'Balablu' : 'Unresolvable';
console.log(`\n  Majority of round ${lastRound}: ${majority} (${count('Fact')} FACT, ${count('Balablu')} BALABLU, ${count('Unsure')} UNSURE)`);
if (audit.council_overruled) console.log('  (the council overruled the panel for this audit)');
else check(majority === audit.outcome, `majority equals the on-chain outcome (${audit.outcome})`);

if (!allOk) {
  console.log('\n  Hint: if the hash checks fail for every vote, the files in --data probably belong to a different audit or an earlier');
  console.log('  deployment of the contract. (data/audits-first-deploy is from the first deployment, whose chain state was later reset:');
  console.log('  its transactions are still on the explorer, but they cannot match the current contract.)');
}
console.log(allOk ? `\nRESULT: audit #${id} VERIFIED` : `\nRESULT: audit #${id} FAILED some checks`);
process.exit(allOk ? 0 : 2);
