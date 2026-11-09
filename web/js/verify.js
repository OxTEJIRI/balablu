// Re-check a jury vote in the browser: hash the exact signed request/response
// bytes and verify the enclave's ed25519 signature with WebCrypto.
import { DATA } from './config.js';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));
const sha = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));

export const modelSlug = (m) => m.replace(/[^A-Za-z0-9.-]+/g, '_');

/** Returns {ok, steps:[{label, ok}], files} */
export async function verifyVote(auditId, round, vote, base = `${DATA}/audits`) {
  const dir = `${base}/${auditId}/r${round}/${modelSlug(vote.model)}`;
  const steps = [];
  const get = async (suffix, asText) => {
    const r = await fetch(`${dir}.${suffix}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`missing ${suffix}`);
    return asText ? r.json() : new Uint8Array(await r.arrayBuffer());
  };
  try {
    const [req, resp, sig] = await Promise.all([get('request.json'), get('response.json'), get('signature.json', true)]);
    const rh = await sha(req);
    const ph = await sha(resp);
    steps.push({ label: 'Question bytes match the hash stored on NEAR', ok: rh === vote.request_sha256 });
    steps.push({ label: 'Answer bytes match the hash stored on NEAR', ok: ph === vote.response_sha256 });
    const text = sig.signature_kind === 'gateway' ? `${rh}:${ph}` : `${vote.model}:${rh}:${ph}`;
    steps.push({ label: 'Signed text is exactly model + both hashes', ok: sig.text === text });
    let sigOk = false;
    try {
      const key = await crypto.subtle.importKey('raw', unhex(sig.signing_address), { name: 'Ed25519' }, false, ['verify']);
      sigOk = await crypto.subtle.verify({ name: 'Ed25519' }, key, unhex(sig.signature), new TextEncoder().encode(text));
    } catch {
      steps.push({ label: 'This browser cannot check Ed25519 (try Chrome or Firefox)', ok: false });
    }
    steps.push({ label: `Enclave signature is valid (key ${sig.signing_address.slice(0, 10)}…)`, ok: sigOk });
    return { ok: steps.every((s) => s.ok), steps, files: dir };
  } catch (e) {
    return { ok: false, steps: [{ label: `Could not load the signed files (${e.message})`, ok: false }], files: dir };
  }
}

/** Check that the AI-written page we show is the one anchored on NEAR. */
export async function verifyPage(slug, anchor) {
  try {
    const r = await fetch(`${DATA}/pages/${slug}/v${anchor.version}.response.json`, { cache: 'no-store' });
    if (!r.ok) return false;
    return (await sha(new Uint8Array(await r.arrayBuffer()))) === anchor.response_sha256;
  } catch {
    return false;
  }
}
