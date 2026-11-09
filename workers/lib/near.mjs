// Minimal NEAR helpers: views over JSON-RPC, transactions through near-cli-rs
// (keys from the legacy keychain ~/.near-credentials). No npm dependencies.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const NETWORK = process.env.NEAR_NETWORK || 'testnet';
export const CONTRACT = process.env.BALABLU_CONTRACT || 'balabluapp.testnet';
// rpc.*.near.org is deprecated and rate-limited; FastNEAR is the default
export const RPC = process.env.NEAR_RPC || (NETWORK === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
const NEAR_BIN = process.env.NEAR_CLI || 'near';

export async function view(method, args = {}, contract = CONTRACT) {
  const body = {
    jsonrpc: '2.0', id: 'balablu', method: 'query',
    params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') },
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      if (j.result?.error) throw new Error(j.result.error);
      return JSON.parse(Buffer.from(j.result.result).toString() || 'null');
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
}

/** Send a function-call transaction signed by `signer`. Large args go via a file. */
export function call(method, args, signer, { contract = CONTRACT, deposit = '0 NEAR', gas = '300 Tgas' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'balablu-'));
  const file = join(dir, 'args.json');
  writeFileSync(file, JSON.stringify(args));
  const r = spawnSync(NEAR_BIN, [
    'contract', 'call-function', 'as-transaction', contract, method, 'file-args', file,
    'prepaid-gas', gas, 'attached-deposit', deposit, 'sign-as', signer,
    'network-config', NETWORK, 'sign-with-legacy-keychain', 'send',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // near-cli-rs prints the return value alone on stdout; everything else on stderr
  const strip = (s) => (s || '').replace(/\x1b\[[0-9;]*m/g, '');
  const log = strip(r.stderr);
  const tx = log.match(/Transaction ID:\s*(\S+)/)?.[1];
  const ok = /succeeded/.test(log) && r.status === 0;
  const err = log.match(/Smart contract panicked: [^"\n)]+/)?.[0] || log.match(/Error:[^\n]*\n[^\n]*/)?.[0];
  const value = strip(r.stdout).trim() || null;
  return { ok, tx, error: ok ? null : (err || log.slice(-600)), value };
}

export function explorer(tx) {
  return `https://${NETWORK === 'mainnet' ? '' : 'testnet.'}nearblocks.io/txns/${tx}`;
}
