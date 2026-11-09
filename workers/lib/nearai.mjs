// NEAR AI Cloud client: exact-bytes chat calls + enclave signatures, verified locally.
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

export const API = process.env.NEAR_AI_BASE || 'https://cloud-api.near.ai/v1';

export function apiKey() {
  if (process.env.NEAR_AI_API_KEY) return process.env.NEAR_AI_API_KEY.trim();
  for (const p of ['.env', '../.env']) {
    if (!existsSync(p)) continue;
    const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith('NEAR_AI_API_KEY='));
    if (line) return line.slice('NEAR_AI_API_KEY='.length).trim();
  }
  throw new Error('NEAR_AI_API_KEY is not set (env or .env)');
}

export const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Call a model with an exact request body. Returns the raw request/response
 * bytes (what the enclave signs) plus the parsed response.
 */
export async function chatExact(bodyObj, { timeoutMs = 180_000 } = {}) {
  const requestBytes = Buffer.from(JSON.stringify(bodyObj), 'utf8');
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'x-no-aliasing': 'true' },
    body: requestBytes,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const responseBytes = Buffer.from(await r.arrayBuffer());
  if (!r.ok) throw new Error(`NEAR AI ${r.status}: ${responseBytes.toString().slice(0, 300)}`);
  return { requestBytes, responseBytes, json: JSON.parse(responseBytes.toString('utf8')), provider: r.headers.get('x-serving-provider') };
}

export async function fetchSignature(chatId, model) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${API}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(model)}&signing_algo=ed25519`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (r.ok) return r.json();
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  throw new Error(`no signature for ${chatId}`);
}

export async function attestation(model) {
  const r = await fetch(`${API}/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ed25519`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!r.ok) throw new Error(`attestation ${model}: ${r.status}`);
  return r.json();
}

export function verifyEd25519(pubHex, sigHex, message) {
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pubHex, 'hex')]), format: 'der', type: 'spki' });
  return edVerify(null, Buffer.from(message), key, Buffer.from(sigHex, 'hex'));
}

/** Check a signature the same way the contract does. */
export function checkSigned(sig, requestBytes, responseBytes) {
  const req = sha256hex(requestBytes);
  const resp = sha256hex(responseBytes);
  const expected = sig.signature_kind === 'gateway' ? `${req}:${resp}` : `${sig.text.split(':').slice(0, -2).join(':')}:${req}:${resp}`;
  if (sig.text !== expected) return { ok: false, why: `signed text mismatch (${sig.text.slice(0, 40)}…)` };
  if (!verifyEd25519(sig.signing_address, sig.signature, sig.text)) return { ok: false, why: 'bad signature' };
  return { ok: true };
}

/** Same verdict reader as the contract (jury.rs parse_verdict). */
export function parseVerdict(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;
  let start = content.lastIndexOf('{"verdict"');
  if (start < 0) start = content.indexOf('{');
  if (start < 0) return null;
  for (let end = content.length; end > start; end--) {
    try {
      const v = JSON.parse(content.slice(start, end));
      const verdict = String(v.verdict || '').trim().toUpperCase();
      if (['FACT', 'BALABLU', 'UNSURE'].includes(verdict)) return { verdict, reason: String(v.reason || '') };
      return null;
    } catch { /* shrink */ }
  }
  return null;
}
