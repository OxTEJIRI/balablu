// A tiny card for iframes on other sites. No header, no footer.
import { useState, useEffect } from 'preact/hooks';
import { html, OddsBar, Verdict, Blu, pct } from '../ui.js';
import { getCards } from '../data.js';

export function Embed({ id }) {
  const [card, setCard] = useState(null);
  useEffect(() => { getCards().then((l) => setCard(l.find((c) => c.claim.id === id) || false)); }, [id]);
  const base = `${location.origin}/claim/${id}`;
  if (card === null) return html`<div style="padding:16px" class="muted">Loading…</div>`;
  if (card === false) return html`<div style="padding:16px" class="muted">Claim not found.</div>`;
  return html`<div style="padding:10px"><div class="card pop stack" style="padding:16px;gap:10px;box-shadow:4px 4px 0 var(--ink)">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="row" style="gap:6px;flex-wrap:nowrap"><${Blu} size=${28}/><b>BalaBlu</b></span>${card.last_outcome ? html`<${Verdict} outcome=${card.last_outcome}/>` : html`<span class="tag" style="background:var(--lime-2)">${pct(card.odds_bps)}% FACT</span>`}</div>
    <a href=${base} target="_top" style="color:var(--ink);text-decoration:none"><span class="serif" style="font-weight:600;font-size:17px;line-height:1.3">“${card.claim.text}”</span></a>
    <${OddsBar} bps=${card.odds_bps}/>
    <a class="btn small lime" target="_top" href=${base}>Call it on BalaBlu</a>
  </div></div>`;
}
