#!/usr/bin/env node
// Keeper: rolls the surprise-audit dice on every claim, runs the jury for any
// audit waiting for votes, and finalizes audits whose windows have closed.
// Meant for a GitHub Actions schedule or a manual run.
//
//   node workers/keeper.mjs [--keeper admin.balabluapp.testnet] [--no-roll]
import { spawnSync } from 'node:child_process';
import { view, call, explorer } from './lib/near.mjs';

const args = process.argv.slice(2);
const keeper = args.includes('--keeper') ? args[args.indexOf('--keeper') + 1] : process.env.BALABLU_SIGNER || 'admin.balabluapp.testnet';
const roll = !args.includes('--no-roll');

const claims = await view('get_claims', { from_index: 0, limit: 100 });
const now = Date.now();
for (const c of claims) {
  if (roll && c.active_audit == null) {
    const r = call('surprise_roll', { claim_id: c.id }, keeper, { gas: '50 Tgas' });
    const started = r.ok && r.value && r.value !== 'null';
    console.log(`claim ${c.id}: surprise roll ${started ? `→ AUDIT #${r.value}` : r.ok ? 'quiet' : `failed: ${r.error}`}`);
  }
}
const n = await view('audits_count');
for (let id = 0; id < n; id++) {
  const a = await view('get_audit', { audit_id: id });
  if (['AwaitingJury', 'AwaitingPanel'].includes(a.status)) {
    if (now >= a.deadline_ms) {
      const r = call('cancel_stale', { audit_id: id }, keeper, { gas: '50 Tgas' });
      console.log(`audit ${id}: stale → ${r.ok ? 'cancelled' : r.error}`);
    } else {
      console.log(`audit ${id}: running the jury`);
      spawnSync(process.execPath, ['workers/jury.mjs', String(id), '--signer', keeper], { stdio: 'inherit' });
    }
  } else if (['AppealWindow', 'CouncilWindow'].includes(a.status) && now >= a.deadline_ms) {
    const r = call('finalize', { audit_id: id }, keeper, { gas: '100 Tgas' });
    console.log(`audit ${id}: finalize → ${r.ok ? `done ${explorer(r.tx)}` : r.error}`);
  }
}
