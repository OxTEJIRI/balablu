// "Explain like I'm 5": rewrites a page in very simple words, keeping [#id] claim markers.
import { createHash } from 'node:crypto';
import { chat } from '../lib/ai.mjs';

const cache = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const text = String(b.text || '').slice(0, 6000);
  if (text.length < 20) return res.status(400).json({ error: 'nothing to explain' });
  const key = createHash('sha256').update(text).digest('hex');
  if (cache.has(key)) return res.status(200).json({ text: cache.get(key), cached: true });
  try {
    const { text: out } = await chat([
      { role: 'system', content: 'Rewrite the Markdown page so a 5-year-old understands it. Very short sentences, everyday words, one fun comparison at most. Keep every [#number] marker right after the sentence it belongs to. Keep the ## headings. Output Markdown only.' },
      { role: 'user', content: text },
    ], { temperature: 0.2 });
    cache.set(key, out);
    return res.status(200).json({ text: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
