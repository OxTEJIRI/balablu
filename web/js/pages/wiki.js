import { useState, useEffect } from 'preact/hooks';
import { html, Blu, BetSheet, Loading, Empty, Verdict, hlColor, useEvent, toast, pct } from '../ui.js';
import { getPages, getCards, view, postJSON } from '../data.js';
import { renderPage } from '../md.js';
import { verifyPage } from '../verify.js';
import { DATA, EXPLORER } from '../config.js';

export function WikiIndex() {
  const [pages, setPages] = useState(null);
  useEffect(() => { getPages().then(setPages); }, []);
  if (!pages) return html`<div class="wrap"><${Loading}/></div>`;
  return html`<div class="wrap stack" style="padding-top:36px;gap:22px">
    <h1 class="h2">The encyclopedia</h1>
    <p class="serif muted" style="margin:0;font-size:19px">Every page is written by an AI from the live odds, signed inside a sealed chip, and anchored on NEAR.</p>
    <div class="grid cols-auto">
      ${pages.map((p) => html`<a class="card stack" style="gap:8px" href=${`/wiki/${p.slug}`}>
        <b style="font-size:22px">${p.title}</b>
        ${p.cards.slice(0, 3).map((c) => html`<span class="serif" style=${`font-size:15px;padding:1px 4px;border-radius:4px;background:${c.last_outcome === 'Balablu' ? 'none' : hlColor(c.odds_bps)};${c.last_outcome === 'Balablu' ? 'text-decoration:line-through;text-decoration-color:var(--coral)' : ''}`}>${c.claim.text}</span>`)}
      </a>`)}
    </div>
  </div>`;
}

export function Wiki({ slug }) {
  const [page, setPage] = useState(null);
  const [md, setMd] = useState(null);
  const [anchor, setAnchor] = useState(undefined);
  const [signed, setSigned] = useState(null);
  const [eli5, setEli5] = useState(false);
  const [simple, setSimple] = useState(null);
  const [sheet, setSheet] = useState(null);

  const load = async () => {
    const pages = await getPages();
    const p = pages.find((x) => x.slug === slug);
    setPage(p || false);
    if (!p) return;
    const a = await view('get_page_anchor', { page: p.title }).catch(() => null);
    setAnchor(a);
    let text = null;
    if (a) {
      text = await fetch(`${DATA}/pages/${slug}/v${a.version}.md`).then((r) => (r.ok ? r.text() : null)).catch(() => null);
      verifyPage(slug, a).then(setSigned);
    }
    if (!text) text = `# ${p.title}\n\n## Claims\n\n${p.cards.map((c) => `${c.claim.text} [#${c.claim.id}]`).join('\n\n')}`;
    setMd(text);
  };
  useEffect(() => { load(); }, [slug]);
  useEvent('bet', () => getCards(true).then(load));

  async function toggleEli5() {
    if (eli5) return setEli5(false);
    setEli5(true);
    if (simple) return;
    try {
      const r = await postJSON('/api/eli5', { text: md });
      setSimple(r.text);
    } catch (e) {
      toast('Blu could not simplify this page right now.', true);
      setEli5(false);
    }
  }

  if (page === false) return html`<div class="wrap"><${Empty} text="No page here yet. Ask Blu about it!"/></div>`;
  if (!page || md == null) return html`<div class="wrap"><${Loading}/></div>`;
  const cards = new Map(page.cards.map((c) => [c.claim.id, c]));
  const shown = eli5 ? simple : md;
  const { sections, body } = shown ? renderPage(shown, cards, (card) => setSheet({ card, side: 'Fact' })) : { sections: [], body: [] };

  return html`<div class="wrap" style="padding-top:28px">
    <div class="row" style="justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:12px">
      <div>
        <h1 style="font-weight:800;font-size:clamp(36px,5vw,52px);letter-spacing:-1.8px">${page.title}</h1>
        <span class="serif muted" style="font-style:italic;font-size:16px">From BalaBlu, the encyclopedia where every fact has odds</span>
      </div>
      <div class="row">
        <button class="btn small" aria-pressed=${eli5} onClick=${toggleEli5}>
          <span style=${`width:34px;height:20px;border-radius:10px;border:1.5px solid var(--ink);background:${eli5 ? 'var(--lime)' : '#DCE3D6'};display:flex;align-items:center;padding:0 2px;justify-content:${eli5 ? 'flex-end' : 'flex-start'}`}><span style="width:14px;height:14px;border-radius:50%;background:var(--ink)"></span></span>
          Explain like I’m 5
        </button>
        <a class="btn small" href="/ask">Ask Blu</a>
      </div>
    </div>
    <div class="row mono muted" style="font-size:13px;gap:6px 18px;margin-bottom:22px">
      ${anchor ? html`<span>Version ${anchor.version} · written by ${anchor.model.split('/').pop()}</span>` : html`<span>Not written yet: showing the raw claims</span>`}
      <span>${page.cards.length} claims</span>
      ${anchor && html`<span title="The page text you see hashes to the value anchored on NEAR">${signed == null ? 'checking signature…' : signed ? '✓ page signature anchored on NEAR' : '✗ page does not match its anchor'}</span>`}
    </div>
    <div class="article">
      <nav class="toc hide-sm" aria-label="Contents" style="flex:0 1 200px;display:flex;flex-direction:column;gap:8px">
        <b class="kicker">Contents</b>
        ${sections.map((s, i) => html`<a class=${i === 0 ? 'on' : ''} href=${'#' + s.id} onClick=${(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }); }}>${s.title}</a>`)}
        <div class="legend" style="margin-top:14px">
          <b>How to read this page</b><br/>
          <span style="background:#CEFF52;padding:0 3px">Bright</span> = people are sure it’s true.<br/>
          <span style="background:#EEFBC9;padding:0 3px">Pale</span> = not so sure.<br/>
          <span style="text-decoration:line-through;text-decoration-color:var(--coral);text-decoration-thickness:3px">Struck</span> = BalaBlu’d by the jury.<br/>
          Tap any highlighted sentence to call it.
        </div>
      </nav>
      <article class="body" aria-live="polite">
        ${eli5 && !simple ? html`<${Loading} text="Blu is rewriting this in simple words…"/>` : body}
        <div class="card aqua row" style="font-family:var(--display);font-size:16px;line-height:1.5;margin-top:10px;flex-wrap:nowrap;align-items:flex-start">
          <${Blu} face="magnifier" size=${52}/>
          <span><b>Psst, Blu here.</b> Think a highlighted line is nonsense? Tap it and call BALABLU. Got a good source? Add it on the claim page and the jury will read it.</span>
        </div>
      </article>
      <aside class="card" style="padding:0;overflow:hidden">
        <div style="background:var(--ink);color:#fff;padding:14px 16px;font-weight:800;font-size:18px">${page.title}: quick facts</div>
        <div style="padding:6px 16px 14px">
          ${page.cards.map((c) => html`<a href=${`/claim/${c.claim.id}`} style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);color:var(--ink);text-decoration:none;font-size:15px">
            <span>${c.claim.text}</span>
            <span style="white-space:nowrap">${c.last_outcome ? html`<${Verdict} outcome=${c.last_outcome}/>` : html`<span class="tag" style=${`background:${hlColor(c.odds_bps)}`}>${pct(c.odds_bps)}%</span>`}</span>
          </a>`)}
          <p class="muted" style="font-size:13px;margin:10px 0 0">Every row is a claim you can call.</p>
        </div>
      </aside>
    </div>
    ${sheet && html`<${BetSheet} card=${sheet.card} side=${sheet.side} onClose=${() => setSheet(null)}/>`}
  </div>`;
}
