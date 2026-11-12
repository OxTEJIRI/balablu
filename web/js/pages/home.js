import { useState, useEffect } from 'preact/hooks';
import { html, Blu, OddsBar, BetSheet, Loading, useEvent, pct } from '../ui.js';
import { getCards, getPages } from '../data.js';

const badge = (p) => (p >= 70 ? 'var(--lime)' : p >= 40 ? 'var(--lime-2)' : 'var(--coral-2)');

export function Home() {
  const [cards, setCards] = useState(null);
  const [pages, setPages] = useState([]);
  const [sheet, setSheet] = useState(null);
  const load = () => { getCards(true).then(setCards); getPages().then(setPages); };
  useEffect(load, []);
  useEvent('bet', load);

  if (!cards) return html`<div class="wrap"><${Loading}/></div>`;
  const open = cards.filter((c) => c.status === 'Open' && !c.last_outcome);
  // hottest = most contested open claim with activity
  const hot = [...open].sort((a, b) => Math.abs(a.odds_bps - 5000) - Math.abs(b.odds_bps - 5000) || Number(b.volume_points) - Number(a.volume_points))[0] || cards[0];
  const busted = cards.filter((c) => c.last_outcome === 'Balablu');
  const facts = cards.filter((c) => c.last_outcome === 'Fact');

  return html`<div class="wrap stack" style="gap:56px;padding-top:44px">
    <section class="row" style="gap:40px;align-items:center">
      <div class="stack" style="flex:1 1 500px;min-width:0;gap:20px">
        <span class="chip dark" style="align-self:flex-start">THE ENCYCLOPEDIA WITH ODDS</span>
        <h1 class="h1">Every fact has odds. <span class="hl">Don’t get BalaBlu’d.</span></h1>
        <p class="serif" style="margin:0;font-size:21px;line-height:1.55;color:var(--ink-2);max-width:560px">Read a page. If a sentence smells like nonsense, call it. Play with free points (or up to $2), and a jury of three AIs in sealed boxes settles who was right.</p>
        <div class="row">
          <a class="btn lime big" href="/play">Play today’s Daily Bla</a>
          <a class="btn big" href="/wiki">Browse the encyclopedia</a>
        </div>
        <span class="muted" style="font-size:14px">No wallet needed to start. You get 1,000 free practice points.</span>
      </div>
      ${hot && html`<div class="card pop stack" style="flex:1 1 400px;min-width:0;padding:26px;gap:16px">
        <div class="row" style="justify-content:space-between"><span class="kicker">Hottest claim · ${hot.claim.page}</span><a class="mono" style="font-size:12px;font-weight:700" href=${`/claim/${hot.claim.id}`}>details</a></div>
        <p class="quote" style="margin:0">“${hot.claim.text}”</p>
        <${OddsBar} bps=${hot.odds_bps}/>
        <div class="callpair">
          <button class="call fact" onClick=${() => setSheet({ card: hot, side: 'Fact' })}>FACT<small>${pct(hot.odds_bps)}%</small></button>
          <button class="call bla" onClick=${() => setSheet({ card: hot, side: 'Balablu' })}>BALABLU<small>${100 - pct(hot.odds_bps)}%</small></button>
        </div>
        <span class="muted" style="font-size:13px">Next surprise audit: any time. Betting pauses while the jury works.</span>
      </div>`}
    </section>

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
      ${[
        ['1', 'Read', 'Pages look like any encyclopedia. Brighter highlight = people are surer it’s true.', 'var(--lime-2)'],
        ['2', 'Call it', 'Tap a sentence. Press FACT or BALABLU. Free points, or up to $2.', 'var(--coral-2)'],
        ['3', 'The jury rules', 'Three AIs check the sources. NEAR checks their signatures. Winners get paid.', 'var(--aqua-2)'],
      ].map(([n, t, d, bg]) => html`<div class="card row" style="align-items:flex-start;flex-wrap:nowrap">
        <span style=${`font:800 34px var(--display);background:${bg};width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex:none`}>${n}</span>
        <div><b style="font-size:19px">${t}</b><p class="muted" style="margin:4px 0 0;font-size:15px;line-height:1.5">${d}</p></div>
      </div>`)}
    </section>

    ${busted.length > 0 && html`<section class="card coral stack" style="padding:28px;gap:18px">
      <div class="row" style="justify-content:space-between">
        <div class="row"><${Blu} face="raspberry" size=${60}/><h2 class="h2">Got BalaBlu’d</h2></div>
        <span style="font-weight:700">Settled by the AI jury, checked on NEAR</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        ${busted.map((c) => html`<a class="card stack" style="gap:10px" href=${`/audit/${c.last_audit}`}>
          <span class="kicker">${c.claim.page}</span>
          <span class="serif" style="font-size:19px;font-weight:600;line-height:1.35;text-decoration:line-through;text-decoration-color:var(--coral);text-decoration-thickness:3px">“${c.claim.text}”</span>
          <span class="mono" style="font-size:13px;font-weight:700">See the jury’s votes →</span>
        </a>`)}
      </div>
    </section>`}

    ${facts.length > 0 && html`<section class="card lime row" style="gap:16px">
      <${Blu} face="stars" size=${56}/>
      <div class="stack" style="flex:1;gap:6px;min-width:240px">
        <b style="font-size:20px">Checked and true</b>
        ${facts.map((c) => html`<a href=${`/audit/${c.last_audit}`} style="color:var(--ink)">“${c.claim.text}”</a>`)}
      </div>
    </section>`}

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
      <a class="card stack" style="gap:8px" href="/paste"><${Blu} face="magnifier" size=${44}/><b style="font-size:20px">Paste a link</b><span class="muted" style="font-size:15px;line-height:1.5">Drop in any article. Blu pulls out the claims you can bet on.</span></a>
      <a class="card stack" style="gap:8px" href="/ask"><${Blu} face="squint" size=${44}/><b style="font-size:20px">Ask Blu</b><span class="muted" style="font-size:15px;line-height:1.5">Not sure if something is true? Ask. Blu answers from the odds and the jury.</span></a>
      <a class="card stack" style="gap:8px" href="/docs#for-ai-agents"><${Blu} face="stars" size=${44}/><b style="font-size:20px">For AI agents</b><span class="muted" style="font-size:15px;line-height:1.5">An odds API and an MCP server, so bots can check BalaBlu before they answer.</span></a>
    </section>

    <section class="stack" style="gap:18px">
      <div class="row" style="justify-content:space-between"><h2 class="h2">Trending pages</h2><span class="muted">Pages rewrite themselves when the odds move.</span></div>
      <div class="grid cols-auto">
        ${pages.map((p) => {
          const avg = Math.round(p.cards.reduce((s, c) => s + c.odds_bps, 0) / p.cards.length / 100);
          const calls = p.cards.reduce((s, c) => s + Number(c.volume_points) / 1e6 + Number(c.volume_usdc) / 1e6, 0);
          return html`<a class="card stack" style="gap:10px" href=${`/wiki/${p.slug}`}>
            <div class="row" style="justify-content:space-between"><b style="font-size:21px">${p.title}</b><span class="tag" style=${`background:${badge(avg)}`}>${p.cards.length} claims</span></div>
            <span class="serif muted" style="font-size:16px;line-height:1.45">${p.cards[0].claim.text}</span>
            <span class="mono muted" style="font-size:12px">${Math.round(calls).toLocaleString()} pts called · ${p.cards.filter((c) => c.last_outcome).length} checked by the jury</span>
          </a>`;
        })}
      </div>
    </section>
    ${sheet && html`<${BetSheet} card=${sheet.card} side=${sheet.side} onClose=${() => setSheet(null)}/>`}
  </div>`;
}
