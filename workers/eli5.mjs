#!/usr/bin/env node
// Pre-writes the "Explain like I'm 5" version of every page's latest version
// (data/pages/<slug>/v<N>.eli5.md) so the toggle on the site is instant.
//   node workers/eli5.mjs            (all pages, only missing ones)
//   node workers/eli5.mjs --force
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chatExact } from './lib/nearai.mjs';

const MODEL = process.env.ELI5_MODEL || 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const force = process.argv.includes('--force');
const SYSTEM = 'Rewrite the Markdown page so a 5-year-old understands it. Very short sentences, everyday words, one fun comparison at most. Keep every [#number] marker right after the sentence it belongs to. Keep the ## headings. Output Markdown only.';

export async function eli5For(md) {
  for (const maxTokens of [3000, 8000]) {
    const r = await chatExact({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: md }], temperature: 0.2, max_tokens: maxTokens, stream: false });
    const text = String(r.json.choices?.[0]?.message?.content || '').replace(/^[\s\S]*<\/think>/, '').trim();
    if (text) return text;
  }
  throw new Error('no ELI5 text');
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const root = join('data', 'pages');
  for (const slug of readdirSync(root)) {
    const versions = readdirSync(join(root, slug)).map((f) => f.match(/^v(\d+)\.md$/)?.[1]).filter(Boolean).map(Number);
    if (!versions.length) continue;
    const v = Math.max(...versions);
    const out = join(root, slug, `v${v}.eli5.md`);
    if (existsSync(out) && !force) { console.log(`${slug} v${v}: already there`); continue; }
    const t0 = Date.now();
    writeFileSync(out, `${await eli5For(readFileSync(join(root, slug, `v${v}.md`), 'utf8'))}\n`);
    console.log(`${slug} v${v}: written in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}
