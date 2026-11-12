// Shared server-side claim helpers for the public API, the MCP server and Ask Blu.
import { view } from './near.mjs';

/** Our own test claims on the live contract: not real content. */
export const HIDDEN = new Set([14, 16, 17, 18]);
export const SITE = 'https://balabluapp.vercel.app';

let cache = { at: 0, list: [] };
export async function allCards() {
  if (Date.now() - cache.at > 8000) {
    const list = (await view('get_cards', { from_index: 0, limit: 100 })).filter((c) => !HIDDEN.has(c.claim.id));
    cache = { at: Date.now(), list };
  }
  return cache.list;
}

const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || []);

export function rank(cards, query, n = 5) {
  const q = words(query);
  return cards
    .map((c) => ({ c, s: [...words(`${c.claim.page} ${c.claim.text}`)].filter((w) => q.has(w)).length }))
    .filter((x) => x.s > 0)
    .sort((a, z) => z.s - a.s)
    .slice(0, n)
    .map((x) => x.c);
}

/** What an AI agent (or any developer) needs to know about one claim. */
export function publicClaim(c) {
  const verdict = c.last_outcome === 'Balablu' ? 'FALSE (BalaBlu)' : c.last_outcome === 'Fact' ? 'TRUE (FACT)' : c.last_outcome === 'Unresolvable' ? 'SPLIT' : null;
  return {
    id: c.claim.id,
    page: c.claim.page,
    claim: c.claim.text,
    rule: c.claim.rule,
    fact_odds_percent: Math.round(c.odds_bps / 100),
    jury_verdict: verdict,
    verified_by_jury: !!c.last_outcome,
    audit: c.last_audit != null ? `${SITE}/audit/${c.last_audit}` : null,
    sources: c.claim.sources,
    url: `${SITE}/claim/${c.claim.id}`,
    badge: `${SITE}/api/badge?id=${c.claim.id}`,
  };
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version');
}
