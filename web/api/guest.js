// Guest (no wallet) practice actions, signed by the relayer's restricted key.
// The contract only lets the relayer touch practice points of *.guest ids.
import { relayer } from '../lib/near.mjs';

const recent = new Map(); // guest -> timestamps (per serverless instance)
const GUEST = /^g[0-9a-f]{16}\.guest$/;
const SIDES = new Set(['Fact', 'Balablu']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { guest, action } = b;
  if (!GUEST.test(guest || '')) return res.status(400).json({ error: 'bad guest id' });

  const now = Date.now();
  const hits = (recent.get(guest) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 20) return res.status(429).json({ error: 'slow down a little' });
  hits.push(now);
  recent.set(guest, hits);

  const claim_id = Number(b.claim_id);
  let method;
  let args;
  if (action === 'points') {
    method = 'guest_claim_points';
    args = { guest };
  } else if (action === 'buy') {
    if (!Number.isInteger(claim_id) || !SIDES.has(b.side) || !/^\d{1,13}$/.test(String(b.amount))) return res.status(400).json({ error: 'bad bet' });
    method = 'guest_buy';
    args = { guest, claim_id, side: b.side, amount: String(b.amount) };
  } else if (action === 'sell') {
    if (!Number.isInteger(claim_id) || !SIDES.has(b.side) || !/^\d{1,16}$/.test(String(b.shares))) return res.status(400).json({ error: 'bad sell' });
    method = 'guest_sell';
    args = { guest, claim_id, side: b.side, shares: String(b.shares) };
  } else if (action === 'redeem') {
    if (!Number.isInteger(claim_id) || !Number.isInteger(Number(b.epoch))) return res.status(400).json({ error: 'bad redeem' });
    method = 'guest_redeem';
    args = { guest, claim_id, epoch: Number(b.epoch) };
  } else {
    return res.status(400).json({ error: 'unknown action' });
  }
  try {
    const r = await relayer().call(method, args);
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
