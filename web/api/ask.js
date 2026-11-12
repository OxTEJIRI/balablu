// Ask Blu: answers from claims, odds and jury verdicts (NEAR AI, Qwen in a TEE).
import { view } from '../lib/near.mjs';
import { chat, firstJson } from '../lib/ai.mjs';

const SYSTEM = `You are Blu, the friendly bla-bla detective of BalaBlu, an encyclopedia where every claim has odds.
Answer ONLY from the CLAIMS list. Talk like a fun, kind friend: short sentences, no jargon, no crypto words.
- A jury verdict beats odds: if the jury BalaBlu'd a claim or ruled it a FACT, lead with that.
- Otherwise say what the odds say ("people are 84% sure that's a fact"). Near 50%: people are split; invite them to call it.
- If no claim covers the question, say nobody has asked yet and suggest ONE short, checkable claim sentence with a fair rule and a short page name.
Reply with JSON only: {"answer":"...","claim_ids":[ids you used],"new_claim":null or {"page":"...","text":"...","rule":"FACT if ... BALABLU if ..."}}`;

const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || []);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const question = String(b.question || '').trim().slice(0, 300);
  if (question.length < 3) return res.status(400).json({ error: 'ask a question' });
  try {
    const HIDDEN = new Set([16, 17, 18]); // our own test claims
    const cards = (await view('get_cards', { from_index: 0, limit: 100 })).filter((c) => !HIDDEN.has(c.claim.id));
    const q = words(question);
    const ranked = cards
      .map((c) => ({ c, s: [...words(`${c.claim.page} ${c.claim.text}`)].filter((w) => q.has(w)).length }))
      .sort((a, z) => z.s - a.s)
      .slice(0, 12)
      .map((x) => x.c);
    const line = (c) => {
      const v = c.last_outcome === 'Balablu' ? " — the jury BalaBlu'd this" : c.last_outcome === 'Fact' ? ' — the jury ruled FACT' : '';
      return `#${c.claim.id} [${Math.round(c.odds_bps / 100)}% FACT${v}] (${c.claim.page}) ${c.claim.text}`;
    };
    const { text } = await chat([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `CLAIMS:\n${ranked.map(line).join('\n') || '(none yet)'}\n\nQUESTION: ${question}` },
    ]);
    const out = firstJson(text) || { answer: text, claim_ids: [], new_claim: null };
    const byId = new Map(cards.map((c) => [c.claim.id, c]));
    out.claims = (out.claim_ids || []).map((id) => byId.get(Number(id))).filter(Boolean);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
