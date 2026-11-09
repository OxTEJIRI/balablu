// Reads from the BalaBlu contract (NEAR RPC, straight from the browser) and
// guest actions through /api/guest.
import { RPCS, CONTRACT, ONE } from './config.js';

export async function view(method, args = {}) {
  const body = { jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'optimistic', account_id: CONTRACT, method_name: method, args_base64: btoa(JSON.stringify(args)) } };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(RPCS[attempt % RPCS.length], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
      const j = await r.json();
      if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error || j.result.error));
      return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)) || 'null');
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

let cardsCache = { at: 0, promise: null };
/** All claims with odds (cached a few seconds). */
export function getCards(force = false) {
  if (force || !cardsCache.promise || Date.now() - cardsCache.at > 8000) {
    cardsCache = { at: Date.now(), promise: view('get_cards', { from_index: 0, limit: 100 }) };
    cardsCache.promise.catch(() => (cardsCache.promise = null));
  }
  return cardsCache.promise;
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const pct = (bps) => Math.round(bps / 100);
export const fmt = (units, d = 2) => (Number(units) / ONE).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const shortModel = (m) => m.split('/').pop().replace(/-Instruct|-FP8/g, '');

/** Pages built from claims. */
export async function getPages() {
  const cards = await getCards();
  const pages = new Map();
  for (const c of cards) {
    const s = slug(c.claim.page);
    if (!pages.has(s)) pages.set(s, { slug: s, title: c.claim.page, cards: [] });
    pages.get(s).cards.push(c);
  }
  return [...pages.values()];
}

// ---------- guest identity (no wallet needed) ----------
export function guestId() {
  let g = null;
  try { g = localStorage.getItem('balablu.guest'); } catch { /* private mode */ }
  if (!g || !/^g[0-9a-f]{16}\.guest$/.test(g)) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    g = 'g' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') + '.guest';
    try { localStorage.setItem('balablu.guest', g); } catch { /* keep in memory */ }
  }
  return g;
}

export async function guest(action, payload = {}) {
  const r = await fetch('/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guest: guestId(), action, ...payload }) });
  const j = await r.json().catch(() => ({ ok: false, error: 'server error' }));
  if (!j.ok) throw new Error(friendly(j.error));
  return j;
}

/** Make sure the guest has their free points. */
export async function ensurePoints() {
  const w = await view('get_wallet', { account_id: guestId() });
  if (w.got_points) return w;
  await guest('points');
  return view('get_wallet', { account_id: guestId() });
}

export function friendly(msg = '') {
  if (/paused/.test(msg)) return 'Betting is paused: the jury is checking this claim right now.';
  if (/not enough balance/.test(msg)) return "You don't have enough for that bet.";
  if (/per-bet cap/.test(msg)) return 'Max $2 a bet while BalaBlu is new.';
  if (/odds moved/.test(msg)) return 'The odds just moved. Try again.';
  if (/slow down/.test(msg)) return 'Whoa, slow down a little.';
  return msg.replace(/^Smart contract panicked: /, '') || 'Something went wrong.';
}

export async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'server error' }));
  if (!r.ok || j.error) throw new Error(friendly(j.error || 'request failed'));
  return j;
}
