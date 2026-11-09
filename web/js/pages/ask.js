import { useState, useRef, useEffect } from 'preact/hooks';
import { html, Blu, toast, navigate, pct, hlColor } from '../ui.js';
import { postJSON, getCards } from '../data.js';

const STARTERS = ['Can you see the Great Wall from the Moon?', 'Did NEAR launch in 2018?', 'How many hearts does an octopus have?', 'Is the Eiffel Tower taller than 300 m?'];

export function Ask() {
  const q0 = new URLSearchParams(location.search).get('q');
  const [msgs, setMsgs] = useState([{ who: 'blu', text: "Hi, I'm Blu! Ask me if something is true. I answer from the odds and from what the AI jury has checked." }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs]);
  useEffect(() => { if (q0) send(q0); }, []);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    setMsgs((m) => [...m, { who: 'me', text: q }]);
    setBusy(true);
    try {
      const r = await postJSON('/api/ask', { question: q });
      setMsgs((m) => [...m, { who: 'blu', text: r.answer, claims: r.claims || [], proposal: r.new_claim || null }]);
    } catch (e) {
      setMsgs((m) => [...m, { who: 'blu', text: 'Hmm, my magnifier fogged up. Try again in a moment?' }]);
    } finally { setBusy(false); }
  }
  async function putUp(p, i) {
    try {
      setMsgs((m) => m.map((x, k) => (k === i ? { ...x, filing: true } : x)));
      const r = await postJSON('/api/suggest', p);
      await getCards(true);
      toast('Your claim is live! Make the first call.');
      navigate(`/claim/${r.claim_id}`);
    } catch (e) {
      toast(e.message, true);
      setMsgs((m) => m.map((x, k) => (k === i ? { ...x, filing: false } : x)));
    }
  }

  return html`<div class="wrap" style="max-width:760px;padding-top:24px">
    <div class="row" style="margin-bottom:18px"><${Blu} face="squint" size=${56}/><div><h1 class="h2">Ask Blu</h1><span class="muted">Answers from the odds and the sources. Unknown questions become new claims.</span></div></div>
    <div class="chat" aria-live="polite">
      ${msgs.map((m, i) => m.who === 'me' ? html`<div class="bubble me">${m.text}</div>` : html`<div class="bubble blu">
        <span>${m.text}</span>
        ${(m.claims || []).map((c) => html`<a href=${`/claim/${c.claim.id}`} class="row" style=${`justify-content:space-between;flex-wrap:nowrap;gap:8px;border-radius:12px;border:1.5px solid var(--ink);padding:9px 11px;text-decoration:none;color:var(--ink);font-size:14px;background:${c.last_outcome === 'Balablu' ? 'var(--coral-2)' : hlColor(c.odds_bps)}`}>
          <span style=${c.last_outcome === 'Balablu' ? 'text-decoration:line-through;text-decoration-color:var(--coral)' : ''}>“${c.claim.text}”</span>
          <b class="mono">${c.last_outcome === 'Balablu' ? 'BALABLU’D' : c.last_outcome === 'Fact' ? 'FACT ✓' : pct(c.odds_bps) + '%'}</b>
        </a>`)}
        ${m.proposal && html`<div class="card aqua stack" style="padding:12px;gap:8px">
          <span style="font-size:14px"><b>New claim:</b> “${m.proposal.text}”</span>
          <span class="muted" style="font-size:13px">${m.proposal.rule}</span>
          <button class="btn dark small" disabled=${m.filing} onClick=${() => putUp(m.proposal, i)}>${m.filing ? 'Putting it up…' : 'Put it up for calling'}</button>
        </div>`}
      </div>`)}
      ${busy && html`<div class="bubble blu row" style="flex-direction:row"><${Blu} face="magnifier" size=${30} cls="bob"/><span class="muted">Blu is checking the odds…</span></div>`}
      <div ref=${end}></div>
    </div>
    <div class="row" style="margin:18px 0 10px;gap:8px">${STARTERS.map((s) => html`<button class="chip white" style="cursor:pointer" onClick=${() => send(s)}>${s}</button>`)}</div>
    <form class="composer" onSubmit=${(e) => { e.preventDefault(); send(); }}>
      <label class="sr" for="ask">Ask Blu</label>
      <input id="ask" value=${input} onInput=${(e) => setInput(e.target.value)} placeholder="Ask Blu if something is true…" autocomplete="off"/>
      <button class="btn lime small" aria-label="Send" disabled=${busy}>Ask</button>
    </form>
  </div>`;
}
