// Shared page/claim helpers for the page writer and Ask Blu.
import { view } from './near.mjs';

export const slug = (page) => page.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** All claims with their live odds and last jury verdict (one RPC call). */
export async function claimsWithOdds() {
  const HIDDEN = new Set([16, 17, 18]); // our own test claims on the live contract
  const cards = (await view('get_cards', { from_index: 0, limit: 100 })).filter((c) => process.env.BALABLU_CONTRACT || !HIDDEN.has(c.claim.id));
  return cards.map((c) => ({ ...c.claim, odds: Math.round(c.odds_bps / 100), lastVerdict: c.last_outcome }));
}

export function describe(c) {
  const v = c.lastVerdict === 'Balablu' ? " (the AI jury checked it: FALSE, it got BalaBlu'd)" : c.lastVerdict === 'Fact' ? ' (the AI jury checked it: TRUE)' : '';
  return `#${c.id} [${c.odds}% FACT${v}] ${c.text}`;
}
