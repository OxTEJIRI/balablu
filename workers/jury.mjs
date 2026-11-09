#!/usr/bin/env node
// Jury runner: asks every model on the round's list the exact question the
// contract wrote, checks each enclave signature locally, saves the evidence
// bundle to data/audits/, and submits the signed votes on-chain.
//
//   node workers/jury.mjs <audit_id> [--signer admin.balabluapp.testnet] [--dry]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { view, call, explorer } from './lib/near.mjs';
import { chatExact, fetchSignature, checkSigned, parseVerdict, attestation } from './lib/nearai.mjs';

const args = process.argv.slice(2);
const auditId = Number(args[0]);
const signer = args.includes('--signer') ? args[args.indexOf('--signer') + 1] : process.env.BALABLU_SIGNER || 'admin.balabluapp.testnet';
const dry = args.includes('--dry');
if (!Number.isInteger(auditId)) {
  console.error('usage: node workers/jury.mjs <audit_id> [--signer acct] [--dry]');
  process.exit(1);
}

const prompt = await view('get_jury_prompt', { audit_id: auditId });
if (!prompt) throw new Error(`no audit ${auditId}`);
const audit = await view('get_audit', { audit_id: auditId });
if (!['AwaitingJury', 'AwaitingPanel'].includes(audit.status)) {
  console.log(`audit ${auditId} is ${audit.status}; nothing to vote on`);
  process.exit(0);
}
console.log(`Audit #${auditId} round ${prompt.round} · ${prompt.models.length} models\n${prompt.user.split('\n').slice(0, 3).join('\n')}\n`);

const outDir = join('data', 'audits', String(auditId), `r${prompt.round}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'prompt.json'), JSON.stringify(prompt, null, 2));

async function askOne(model) {
  let maxTokens = 2000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const body = {
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0,
      max_tokens: maxTokens,
      stream: false,
    };
    const res = await chatExact(body);
    const v = parseVerdict(res.json);
    if (!v) {
      console.log(`  ${model}: no clean verdict (try ${attempt}), retrying with more tokens`);
      maxTokens += 2000;
      continue;
    }
    const sig = await fetchSignature(res.json.id, model);
    const chk = checkSigned(sig, res.requestBytes, res.responseBytes);
    if (!chk.ok) throw new Error(`${model}: ${chk.why}`);
    const slug = model.replace(/[^A-Za-z0-9.-]+/g, '_');
    writeFileSync(join(outDir, `${slug}.request.json`), res.requestBytes);
    writeFileSync(join(outDir, `${slug}.response.json`), res.responseBytes);
    writeFileSync(join(outDir, `${slug}.signature.json`), JSON.stringify(sig, null, 2));
    console.log(`  ${model.padEnd(40)} ${v.verdict.padEnd(8)} ${v.reason.slice(0, 90)}  [${sig.signature_kind}, ${res.provider}]`);
    return {
      model,
      sig,
      reply: {
        request: res.requestBytes.toString('base64'),
        response: res.responseBytes.toString('base64'),
        public_key_hex: sig.signing_address,
        signature_hex: sig.signature,
      },
    };
  }
  throw new Error(`${model}: no verdict after 3 tries`);
}

const results = await Promise.all(prompt.models.map(askOne));

// every signing key must be registered; register attested new keys if we are the owner
for (const r of results) {
  const known = await view('jury_key_model', { public_key_hex: r.sig.signing_address });
  if (known) continue;
  const kind = r.sig.signature_kind === 'gateway' ? '*gateway*' : r.model;
  const rep = await attestation(r.model);
  const keys = [rep?.gateway_attestation?.signing_address, ...(rep?.model_attestations || []).map((m) => m.signing_public_key || m.signing_address)];
  mkdirSync(join('data', 'attestations'), { recursive: true });
  writeFileSync(join('data', 'attestations', `${r.model.replace(/[^A-Za-z0-9.-]+/g, '_')}.json`), JSON.stringify(rep));
  if (!keys.includes(r.sig.signing_address)) throw new Error(`${r.model}: signing key is not in its attestation report`);
  console.log(`  registering attested key for ${kind}: ${r.sig.signing_address.slice(0, 16)}…`);
  if (!dry) {
    const reg = call('register_jury_key', { model: kind, public_key_hex: r.sig.signing_address }, signer, { gas: '30 Tgas' });
    if (!reg.ok) throw new Error(`register failed: ${reg.error}`);
  }
}

writeFileSync(join(outDir, 'votes.json'), JSON.stringify({ audit_id: auditId, replies: results.map((r) => r.reply) }));
if (dry) {
  console.log(`\n--dry: saved to ${outDir}, not submitted`);
  process.exit(0);
}
const sub = call('submit_votes', { audit_id: auditId, replies: results.map((r) => r.reply) }, signer);
if (!sub.ok) {
  console.error(`\nsubmit_votes failed: ${sub.error}`);
  process.exit(2);
}
console.log(`\nOn-chain verdict: ${sub.value}  ${explorer(sub.tx)}`);
writeFileSync(join(outDir, 'submitted.json'), JSON.stringify({ tx: sub.tx, outcome: sub.value }, null, 2));
