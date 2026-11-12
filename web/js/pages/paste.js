import { useState } from 'preact/hooks';
import { html, Blu, toast, navigate } from '../ui.js';
import { postJSON, getCards } from '../data.js';

export function Paste() {
  const [url, setUrl] = useState(new URLSearchParams(location.search).get('url') || '');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [filing, setFiling] = useState(null);

  async function find(e) {
    e?.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setRes(null);
    try { setRes(await postJSON('/api/extract', { url: url.trim() })); } catch (err) { toast(err.message, true); } finally { setBusy(false); }
  }
  async function putUp(c, i) {
    setFiling(i);
    try {
      const r = await postJSON('/api/suggest', { page: c.page, text: c.text, rule: c.rule });
      await getCards(true);
      toast('Your claim is live! Make the first call.');
      navigate(`/claim/${r.claim_id}`);
    } catch (err) { toast(err.message, true); setFiling(null); }
  }

  return html`<div class="wrap stack" style="max-width:820px;padding-top:28px;gap:20px">
    <div class="row"><${Blu} face="magnifier" size=${60} cls=${busy ? 'bob' : ''}/><div><h1 class="h2">Paste a link</h1><span class="muted">Drop in an article or post. Blu pulls out the claims people can bet on.</span></div></div>
    <form class="composer" onSubmit=${find}>
      <label class="sr" for="u">Link to an article or web page</label>
      <input id="u" type="url" inputmode="url" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="https://… an article, blog post or web page" autocomplete="off"/>
      <button class="btn lime small" disabled=${busy}>${busy ? 'Reading…' : 'Find claims'}</button>
    </form>
    ${busy && html`<div class="row muted"><${Blu} face="magnifier" size=${34} cls="bob"/>Blu is reading the page. This takes about 15 seconds…</div>`}
    ${res && html`<div class="stack" style="gap:14px">
      <span class="kicker">${res.host || ''}${res.title ? ` · ${res.title}` : ''}</span>
      ${res.claims.length === 0 && html`<div class="card row"><${Blu} face="shrug" size=${46}/><span>${res.note || 'Blu could not find checkable facts on that page (opinions and predictions are skipped). Try an article with numbers, dates or events.'}</span></div>`}
      ${res.claims.map((c, i) => html`<div class="card stack" style="gap:10px">
        <span class="kicker">${c.page}</span>
        <span class="quote" style="font-size:22px">“${c.text}”</span>
        <span class="muted" style="font-size:14px"><b>Rule:</b> ${c.rule}</span>
        <div class="row"><button class="btn dark small" disabled=${filing != null} onClick=${() => putUp(c, i)}>${filing === i ? 'Putting it up…' : 'Put it up for calling'}</button>
          <a class="btn small" href=${c.source} target="_blank" rel="noopener noreferrer">Open the source</a></div>
      </div>`)}
      ${res.claims.length > 0 && html`<span class="muted" style="font-size:13px">New claims start as practice-only markets at 50/50. The AI jury can audit them as soon as someone adds a source.</span>`}
    </div>`}
    <div class="card aqua row"><${Blu} face="squint" size=${44}/><span style="flex:1">Rather ask a question? <a href="/ask">Ask Blu</a>. Blu only reads public https pages and never opens private addresses.</span></div>
  </div>`;
}
