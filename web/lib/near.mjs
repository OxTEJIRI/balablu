// Server-side NEAR helpers with no dependencies: RPC views, and signing +
// sending function calls with an ed25519 key (borsh written by hand).
import { createHash, createPrivateKey, sign as edSign } from 'node:crypto';
import './env.mjs';

export const NETWORK = process.env.NEAR_NETWORK || 'testnet';
export const CONTRACT = process.env.BALABLU_CONTRACT || 'balabluapp.testnet';
export const RPC = process.env.NEAR_RPC || (NETWORK === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');

const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = ALPHA.indexOf(c);
    if (i < 0) throw new Error('bad base58');
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let lead = 0;
  while (s[lead] === '1') lead++;
  return Buffer.concat([Buffer.alloc(lead), body]);
}
export function b58encode(buf) {
  let n = BigInt('0x' + (Buffer.from(buf).toString('hex') || '0'));
  let s = '';
  while (n > 0n) {
    s = ALPHA[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}

async function rpc(method, params) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'balablu', method, params }) });
      const j = await r.json();
      if (j.error) {
        const e = new Error(JSON.stringify(j.error).slice(0, 500));
        e.rpc = j.error;
        throw e;
      }
      return j.result;
    } catch (e) {
      if (e.rpc || attempt >= 2) throw e;
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
  }
}

export async function view(method, args = {}, contract = CONTRACT) {
  const res = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  if (res.error) throw new Error(res.error);
  return JSON.parse(Buffer.from(res.result).toString() || 'null');
}

class Borsh {
  parts = [];
  u8(v) { this.parts.push(Buffer.from([v])); }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.parts.push(b); }
  u64(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); this.parts.push(b); }
  u128(v) { const x = BigInt(v); const b = Buffer.alloc(16); b.writeBigUInt64LE(x & 0xffffffffffffffffn, 0); b.writeBigUInt64LE(x >> 64n, 8); this.parts.push(b); }
  raw(buf) { this.parts.push(Buffer.from(buf)); }
  bytes(buf) { this.u32(buf.length); this.raw(buf); }
  str(s) { this.bytes(Buffer.from(s, 'utf8')); }
  done() { return Buffer.concat(this.parts); }
}

function parseKey(secret) {
  const raw = b58decode(secret.replace(/^ed25519:/, ''));
  if (raw.length !== 64) throw new Error('expected a 64-byte ed25519 secret key');
  const seed = raw.subarray(0, 32);
  const pub = raw.subarray(32);
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  return { key, pub };
}

/**
 * Sign and send one function call. Retries on nonce clashes.
 * Returns { ok, tx, value, error }.
 */
export async function callAs(signer, secret, method, args, { contract = CONTRACT, gas = 50_000_000_000_000n, deposit = 0n } = {}) {
  const { key, pub } = parseKey(secret);
  const pubStr = 'ed25519:' + b58encode(pub);
  for (let attempt = 0; attempt < 4; attempt++) {
    const ak = await rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: signer, public_key: pubStr });
    const nonce = BigInt(ak.nonce) + 1n + BigInt(Math.floor(Math.random() * 1000));
    const w = new Borsh();
    w.str(signer);
    w.u8(0);
    w.raw(pub);
    w.u64(nonce);
    w.str(contract);
    w.raw(b58decode(ak.block_hash));
    w.u32(1);
    w.u8(2); // FunctionCall
    w.str(method);
    w.bytes(Buffer.from(JSON.stringify(args)));
    w.u64(gas);
    w.u128(deposit);
    const txBytes = w.done();
    const hash = createHash('sha256').update(txBytes).digest();
    const sig = edSign(null, hash, key);
    const signed = Buffer.concat([txBytes, Buffer.from([0]), sig]);
    try {
      const res = await rpc('broadcast_tx_commit', [signed.toString('base64')]);
      const tx = res.transaction?.hash || b58encode(hash);
      const st = res.status || {};
      if ('SuccessValue' in st) {
        const txt = Buffer.from(st.SuccessValue || '', 'base64').toString();
        return { ok: true, tx, value: txt ? JSON.parse(txt) : null };
      }
      const failure = JSON.stringify(st.Failure || st);
      const panic = failure.match(/Smart contract panicked: ([^"\\]+)/)?.[1];
      return { ok: false, tx, error: panic || failure.slice(0, 300) };
    } catch (e) {
      if (/InvalidNonce|nonce/i.test(e.message) && attempt < 3) continue;
      return { ok: false, error: e.message.slice(0, 300) };
    }
  }
  return { ok: false, error: 'busy, try again' };
}

export function relayer() {
  const account = process.env.RELAYER_ACCOUNT;
  const secret = process.env.RELAYER_PRIVATE_KEY;
  if (!account || !secret) throw new Error('relayer is not configured (RELAYER_ACCOUNT / RELAYER_PRIVATE_KEY)');
  return { call: (method, args, opts) => callAs(account, secret, method, args, opts) };
}
