import { useState, useEffect } from 'preact/hooks';
import { html, Blu, mount, useLocation, useEvent, navigate } from './ui.js';
import { guestId, view, fmt, getCards, getPositions } from './data.js';
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

const ROUTES = [
  [/^\/$/, () => html`<${Home}/>`],
  [/^\/wiki\/?$/, () => html`<${WikiIndex}/>`],
  [/^\/wiki\/([a-z0-9-]+)$/, (m) => html`<${Wiki} slug=${m[1]}/>`],
  [/^\/claim\/(\d+)$/, (m) => html`<${Claim} id=${Number(m[1])}/>`],
  [/^\/audit\/(\d+)$/, (m) => html`<${Audit} id=${Number(m[1])}/>`],
  [/^\/play$/, () => html`<${Play}/>`],
  [/^\/ask$/, () => html`<${Ask}/>`],
  [/^\/bets\/?$/, () => html`<${Me}/>`],
  [/^\/me\/?$/, () => html`<${Me}/>`],
  [/^\/money$/, () => html`<${Wallet}/>`],
  [/^\/docs\/?$/, () => html`<${Docs}/>`],
  [/^\/whitepaper\/?$/, () => html`<${Docs}/>`],
  [/^\/paste\/?$/, () => html`<${Paste}/>`],
];

/**
 * A short message if something needs your attention, otherwise false:
 * a settled bet is waiting to be collected, or a watched claim moved / got a verdict.
 */
async function checkAlerts() {
  const [mine, wallets] = await Promise.all([
    getPositions(guestId()).catch(() => []),
    wallet.account() ? getPositions(wallet.account()).catch(() => []) : [],
  ]);
  if ([...mine, ...wallets].some((p) => p.resolved)) return 'You have a settled bet. Open My bets to collect it.';
  let ids = []; let seen = {}; let seenv = {};
  try { ids = JSON.parse(localStorage.getItem('balablu.watch') || '[]'); seen = JSON.parse(localStorage.getItem('balablu.seen') || '{}'); seenv = JSON.parse(localStorage.getItem('balablu.seenv') || '{}'); } catch { return false; }
  if (!ids.length) return false;
  const cards = await getCards();
  const moved = cards.some((c) => ids.includes(c.claim.id) && (
    (seen[c.claim.id] != null && Math.abs(Math.round(c.odds_bps / 100) - Math.round(seen[c.claim.id] / 100)) >= 3) ||
    (c.last_audit != null && seenv[c.claim.id] !== c.last_audit)));
  return moved ? 'Something moved on a claim you are watching.' : false;
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
  useEvent('wallet', (a) => { setAcct(a); refresh(); });
  const nav = [['/play', 'Daily Bla'], ['/wiki', 'Encyclopedia'], ['/ask', 'Ask Blu'], ['/bets', 'My bets'], ['/docs', 'Docs']];
  const on = (href) => path.startsWith(href) || (href === '/bets' && path === '/me');
  return html`<header class="top">
    <div class="wrap">
      <a class="brand" href="/" aria-label="BalaBlu home"><${Blu} size=${44}/><b>BalaBlu</b></a>
      <form class="search" role="search" onSubmit=${(e) => { e.preventDefault(); if (q.trim()) navigate('/ask?q=' + encodeURIComponent(q.trim())); setQ(''); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <label class="sr" for="q">Ask Blu or search</label>
        <input id="q" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Ask Blu anything…" autocomplete="off"/>
      </form>
      <nav class="nav" aria-label="Main">
        ${nav.map(([href, label]) => html`<a href=${href} class=${on(href) ? 'on' : ''}>${label}</a>`)}
        <a class=${'pts' + (alert ? ' alert' : '')} href="/bets" title=${alert || 'Your free practice points. Click to see all your bets.'} aria-label=${alert ? `${alert} ` : ''}>
          <span class="coin" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#152E40" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/></svg></span>
          ${pts == null ? '1,000 free pts' : `${fmt(pts, 0)} pts`}</a>
        <a class="btn small dark" href="/money">${acct ? acct.replace(/\.(testnet|near)$/, '') : 'Use real money'}</a>
      </nav>
    </div>
  </header>`;
}

/** Redirect wallets (MyNearWallet) send you back here with the result of a transaction in the address. */
function TxBanner() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const tx = (q.get('transactionHashes') || '').split(',')[0];
    const err = q.get('errorMessage') || q.get('errorCode');
    if (!tx && !err) return;
    setInfo(tx ? { ok: true, tx } : { ok: false, msg: decodeURIComponent(err) });
    ['transactionHashes', 'errorMessage', 'errorCode', 'account_id', 'public_key', 'all_keys'].forEach((k) => q.delete(k));
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
  }, []);
  if (!info) return null;
  return html`<div class="wrap" style="padding-top:14px"><div class=${info.ok ? 'card lime row' : 'alertbox'} role="status" style="justify-content:space-between">
    ${info.ok
      ? html`<b>✓ Your transaction went through.</b><span class="row" style="gap:10px"><a href=${`${EXPLORER}/txns/${info.tx}`} target="_blank" rel="noopener">Receipt on NEAR ↗</a><a href="/bets">See my bets</a></span>`
      : html`<span><b>✗ The wallet reported a problem:</b> ${info.msg}. Nothing was changed.</span>`}
    <button class="btn small" onClick=${() => setInfo(null)}>Close</button></div></div>`;
}

function Footer() {
  return html`<footer class="foot">
    <div class="wrap">
      <div class="foot-grid">
        <div class="stack" style="gap:10px">
          <a class="brand" href="/" aria-label="BalaBlu home"><${Blu} size=${40}/><b>BalaBlu</b></a>
          <p class="muted" style="margin:0;font-size:14px;line-height:1.6;max-width:330px">The encyclopedia where every fact has odds. A jury of sealed AIs settles each claim, and a NEAR smart contract checks their signatures.</p>
          <span class="chip dark" style="align-self:flex-start">${NETWORK.toUpperCase()} DEMO · PLAY MONEY</span>
        </div>
        <nav aria-label="Explore" class="foot-col"><b>Explore</b>
          <a href="/play">Daily Bla</a><a href="/wiki">Encyclopedia</a><a href="/ask">Ask Blu</a><a href="/paste">Paste a link</a><a href="/bets">My bets</a></nav>
        <nav aria-label="Learn" class="foot-col"><b>Learn</b>
          <a href="/docs">Whitepaper & roadmap</a><a href="/docs#for-ai-agents">For AI agents</a><a href="/api/v1/odds" target="_blank" rel="noopener">Odds API</a><a href="/llms.txt" target="_blank" rel="noopener">llms.txt</a></nav>
        <nav aria-label="Community" class="foot-col"><b>Community</b>
          <a href="https://x.com/balabluapp" target="_blank" rel="noopener">@balabluapp on X</a><a href=${REPO} target="_blank" rel="noopener">GitHub</a><a href=${`${REPO}/blob/main/JUDGES.md`} target="_blank" rel="noopener">Guide for judges</a><a href=${`${EXPLORER}/address/${CONTRACT}`} target="_blank" rel="noopener">Contract</a></nav>
      </div>
      <div class="foot-bottom">
        <span>© 2026 BalaBlu. Open source under the <a href=${`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener">MIT license</a>.</span>
        <span>Built at NEAR HACKATHON with NEAR AI and NEAR Intents.</span>
        <span>Testnet demo: points and test USDC have no real value. Not financial advice.</span>
      </div>
    </div>
  </footer>`;
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
  return html`<a class="skip" href="#main">Skip to content</a><${Header} path=${path}/>
    <${TxBanner}/>
    <main id="main">${page || html`<div class="wrap row" style="padding:60px 0"><${Blu} face="shrug" size=${70}/><div><b style="font-size:24px">Nothing here.</b><p><a href="/">Back home</a></p></div></div>`}</main>
    <${Footer}/>`;
}

mount(App);
