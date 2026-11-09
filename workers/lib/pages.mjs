// Shared page/claim helpers for the page writer and Ask Blu.
import { view } from './near.mjs';

export const slug = (page) => page.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** All claims with their live practice odds (and USDC odds if a market exists). */
export async function claimsWithOdds() {
  const claims = await view('get_claims', { from_index: 0, limit: 100 });
  return Promise.all(
    claims.map(async (c) => {
      const pts = await view('get_market', { claim_id: c.id, currency: 'Points' });
      const usd = await view('get_market', { claim_id: c.id, currency: 'Usdc' });
      const odds = (usd && Number(usd.volume) > 0 ? usd : pts)?.fact_odds_bps ?? 5000;
      let last = null;
      if (c.audits.length) {
        const a = await view('get_audit', { audit_id: c.audits[c.audits.length - 1] });
        if (a.status === 'Final') last = a.outcome;
      }
      return { ...c, odds: Math.round(odds / 100), lastVerdict: last };
    }),
  );
}

export function describe(c) {
  const v = c.lastVerdict === 'Balablu' ? " (the jury BalaBlu'd this)" : c.lastVerdict === 'Fact' ? ' (jury: FACT)' : '';
  return `#${c.id} [${c.odds}% FACT${v}] ${c.text}`;
}
