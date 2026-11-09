// "Put it up for calling": files an Ask Blu suggestion as a practice-only claim.
import { relayer } from '../lib/near.mjs';

const recent = new Map(); // ip -> timestamps (per instance)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const page = String(b.page || '').trim().slice(0, 60);
  const text = String(b.text || '').trim().slice(0, 200);
  const rule = String(b.rule || '').trim().slice(0, 400);
  if (page.length < 2 || text.length < 10 || rule.length < 10) return res.status(400).json({ error: 'claim needs a page, text and rule' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0];
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 5) return res.status(429).json({ error: 'you have suggested a lot this hour; try later' });
  hits.push(now);
  recent.set(ip, hits);

  try {
    const r = await relayer().call('create_claim', { page, text, rule, sources: [], fact_odds_bps: 5000, usdc_seed: '0' }, { gas: 100_000_000_000_000n });
    return res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true, claim_id: r.value, tx: r.tx } : r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
