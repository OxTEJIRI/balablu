import { useState, useEffect } from 'preact/hooks';
import { html, Blu, mount, useLocation, useEvent, navigate } from './ui.js';
import { guestId, view, fmt } from './data.js';
import { NETWORK, REPO, CONTRACT, EXPLORER } from './config.js';
import * as wallet from './wallet.js';
import { Home } from './pages/home.js';
import { Wiki, WikiIndex } from './pages/wiki.js';
import { Claim } from './pages/claim.js';
import { Audit } from './pages/audit.js';
import { Play } from './pages/play.js';
import { Ask } from './pages/ask.js';
import { Me } from './pages/me.js';
import { Wallet } from './pages/wallet.js';
import { Docs } from './pages/docs.js';
import { Paste } from './pages/paste.js';
import { Embed } from './pages/embed.js';
import { getCards } from './data.js';

const ROUTES = [
  [/^\/$/, () => html`<${Home}/>`],
  [/^\/wiki\/?$/, () => html`<${WikiIndex}/>`],
  [/^\/wiki\/([a-z0-9-]+)$/, (m) => html`<${Wiki} slug=${m[1]}/>`],
  [/^\/claim\/(\d+)$/, (m) => html`<${Claim} id=${Number(m[1])}/>`],
  [/^\/audit\/(\d+)$/, (m) => html`<${Audit} id=${Number(m[1])}/>`],
  [/^\/play$/, () => html`<${Play}/>`],
  [/^\/ask$/, () => html`<${Ask}/>`],
  [/^\/me$/, () => html`<${Me}/>`],
  [/^\/money$/, () => html`<${Wallet}/>`],
  [/^\/docs\/?$/, () => html`<${Docs}/>`],
  [/^\/whitepaper\/?$/, () => html`<${Docs}/>`],
  [/^\/paste\/?$/, () => html`<${Paste}/>`],
];

/** Did a claim on the watchlist move 3+ points, or get a jury verdict, since the Me page was last opened? */
async function checkAlerts() {
  let ids = []; let seen = {}; let seenv = {};
  try { ids = JSON.parse(localStorage.getItem('balablu.watch') || '[]'); seen = JSON.parse(localStorage.getItem('balablu.seen') || '{}'); seenv = JSON.parse(localStorage.getItem('balablu.seenv') || '{}'); } catch { return false; }
  if (!ids.length) return false;
  const cards = await getCards();
  return cards.some((c) => ids.includes(c.claim.id) && (
    (seen[c.claim.id] != null && Math.abs(Math.round(c.odds_bps / 100) - Math.round(seen[c.claim.id] / 100)) >= 3) ||
    (c.last_audit != null && seenv[c.claim.id] !== c.last_audit)));
}

function Header({ path }) {
  const [pts, setPts] = useState(null);
  const [acct, setAcct] = useState(wallet.account());
  const [q, setQ] = useState('');
  const [alert, setAlert] = useState(false);
  const refresh = () => {
    view('get_wallet', { account_id: guestId() }).then((w) => setPts(w.got_points ? w.points : null)).catch(() => {});
    checkAlerts().then(setAlert).catch(() => {});
  };
  useEffect(refresh, []);
  useEvent('bet', refresh);
  useEvent('wallet', setAcct);
  const nav = [['/play', 'Daily Bla'], ['/wiki', 'Encyclopedia'], ['/ask', 'Ask Blu'], ['/docs', 'Docs'], ['/me', 'Me']];
  return html`<header class="top">
    <div class="wrap">
      <a class="brand" href="/" aria-label="BalaBlu home"><${Blu} size=${44}/><b>BalaBlu</b></a>
      <form class="search" role="search" onSubmit=${(e) => { e.preventDefault(); if (q.trim()) navigate('/ask?q=' + encodeURIComponent(q.trim())); setQ(''); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <label class="sr" for="q">Ask Blu or search</label>
        <input id="q" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Ask Blu anything…" autocomplete="off"/>
      </form>
      <nav class="nav" aria-label="Main">
        ${nav.map(([href, label]) => html`<a href=${href} class=${path.startsWith(href) ? 'on' : ''}>${label}</a>`)}
        <a class=${'pts' + (alert ? ' alert' : '')} href="/me" title=${alert ? 'Something moved on a claim you are watching' : 'Your free practice points'}>
          <span class="coin" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#152E40" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/></svg></span>
          ${pts == null ? '1,000 free pts' : `${fmt(pts, 0)} pts`}</a>
        <a class="btn small dark" href="/money">${acct ? acct.replace(/\.(testnet|near)$/, '') : 'Use real money'}</a>
      </nav>
    </div>
  </header>`;
}

function App() {
  const path = useLocation();
  useEffect(() => { wallet.restore(); }, []);
  const em = path.match(/^\/embed\/(\d+)$/);
  if (em) return html`<${Embed} id=${Number(em[1])}/>`;
  let page = null;
  for (const [re, f] of ROUTES) {
    const m = path.match(re);
    if (m) { page = f(m); break; }
  }
  return html`<${Header} path=${path}/>
    <main id="main">${page || html`<div class="wrap row" style="padding:60px 0"><${Blu} face="shrug" size=${70}/><div><b style="font-size:24px">Nothing here.</b><p><a href="/">Back home</a></p></div></div>`}</main>
    <footer class="foot"><div class="wrap row" style="gap:10px 28px">
      <span><b style="color:var(--ink)">Every verdict is checked by the contract on NEAR.</b> AI jury on NEAR AI Cloud · any coin via NEAR Intents.</span>
      <a href="/docs">Whitepaper &amp; roadmap</a>
      <a href="/paste">Paste a link</a>
      <a href="/docs#for-ai-agents">For AI agents</a>
      <a href="https://x.com/balabluapp" target="_blank" rel="noopener">@balabluapp on X</a>
      <a href=${`${EXPLORER}/address/${CONTRACT}`} target="_blank" rel="noopener">Contract ${CONTRACT}</a>
      <a href=${REPO} target="_blank" rel="noopener">Source code</a>
      <span class="mono">${NETWORK}</span>
    </div></footer>`;
}

mount(App);
