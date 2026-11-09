#!/usr/bin/env node
//   node workers/askblu.mjs "Did NEAR launch in 2018?"
import { askBlu } from './lib/askblu.mjs';

const q = process.argv.slice(2).join(' ').trim();
if (!q) {
  console.error('usage: node workers/askblu.mjs "<question>"');
  process.exit(1);
}
const a = await askBlu(q);
console.log(`Blu: ${a.answer}`);
for (const c of a.claims) console.log(`  · #${c.id} ${c.odds}% FACT${c.lastVerdict ? ` (jury: ${c.lastVerdict})` : ''} — ${c.text}`);
if (a.new_claim) console.log(`  → new claim to call: "${a.new_claim.text}"\n    rule: ${a.new_claim.rule}`);
