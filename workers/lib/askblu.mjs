// Ask Blu: answers from the claims and their odds. Unknown question ->
// proposes a new claim people can call. Used by the CLI and the web app.
import { chatExact } from './nearai.mjs';
import { claimsWithOdds, describe } from './pages.mjs';

const MODEL = process.env.ASKBLU_MODEL || 'Qwen/Qwen3.8-27B';

const SYSTEM = `You are Blu, the friendly bla-bla detective of BalaBlu, an encyclopedia where every claim has odds.
Answer the user's question ONLY from the CLAIMS list. Talk like a fun, kind friend; short sentences; no jargon.
- A jury verdict beats odds: if the jury BalaBlu'd a claim or ruled it a FACT, lead with that.
- If a claim answers it: say what the odds say (e.g. "people are 84% sure that's a FACT", or "that got BalaBlu'd").
- If odds are near 50%, say people are split and invite them to call it.
- If no claim covers it, say nobody has asked yet and suggest ONE short, checkable claim sentence for betting, with a fair rule.
Reply with JSON only: {"answer":"...","claim_ids":[numbers you used],"new_claim":null or {"text":"...","rule":"FACT if ... BALABLU if ..."}}`;

/** Simple keyword overlap to send the model only relevant claims. */
function rank(claims, question) {
  const words = new Set(question.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  return claims
    .map((c) => ({ c, score: (`${c.page} ${c.text}`.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => words.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.c);
}

export async function askBlu(question, { claims } = {}) {
  const all = claims || (await claimsWithOdds());
  const ctx = rank(all, question);
  const res = await chatExact({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `CLAIMS:\n${ctx.map(describe).join('\n') || '(none)'}\n\nQUESTION: ${question}` },
    ],
    temperature: 0.3,
    max_tokens: 1500,
    stream: false,
  });
  const content = String(res.json.choices?.[0]?.message?.content || '').replace(/^[\s\S]*<\/think>/, '');
  const start = content.indexOf('{');
  let out = null;
  for (let end = content.length; start >= 0 && end > start && !out; end--) {
    try { out = JSON.parse(content.slice(start, end)); } catch { /* shrink */ }
  }
  if (!out) out = { answer: content.trim(), claim_ids: [], new_claim: null };
  out.claims = (out.claim_ids || []).map((id) => all.find((c) => c.id === id)).filter(Boolean)
    .map((c) => ({ id: c.id, text: c.text, page: c.page, odds: c.odds, lastVerdict: c.lastVerdict }));
  out.chat_id = res.json.id;
  out.model = MODEL;
  return out;
}
