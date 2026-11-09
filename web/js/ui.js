import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import htm from 'htm';
import { view, guest, ensurePoints, guestId, pct, fmt, friendly } from './data.js';
import { ONE } from './config.js';
import * as wallet from './wallet.js';

export const html = htm.bind(h);

// ---------- router ----------
const listeners = new Set();
export function navigate(path) {
  if (path === location.pathname + location.search) return;
  history.pushState({}, '', path);
  listeners.forEach((f) => f());
  window.scrollTo(0, 0);
}
export function useLocation() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    listeners.add(f);
    window.addEventListener('popstate', f);
    return () => { listeners.delete(f); window.removeEventListener('popstate', f); };
  }, []);
  return location.pathname;
}
/** Intercept internal links. */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const href = a.getAttribute('href');
  if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/')) {
    e.preventDefault();
    navigate(href);
  }
});

// ---------- tiny global events ----------
const bus = new Map();
export const on = (ev, f) => { if (!bus.has(ev)) bus.set(ev, new Set()); bus.get(ev).add(f); return () => bus.get(ev).delete(f); };
export const emit = (ev, data) => (bus.get(ev) || []).forEach((f) => f(data));
export function useEvent(ev, f) { useEffect(() => on(ev, f), []); }

// ---------- toasts ----------
let toastEl;
export function toast(msg, err = false) {
  toastEl?.remove();
  toastEl = document.createElement('div');
  toastEl.className = 'toast' + (err ? ' err' : '');
  toastEl.setAttribute('role', 'status');
  toastEl.textContent = msg;
  document.body.appendChild(toastEl);
  const el = toastEl;
  setTimeout(() => el.remove(), 3800);
}

// ---------- Blu ----------
const BODY = 'M38 16H82A28 28 0 0 1 110 44V58A28 28 0 0 1 82 86H52L26 106L32 85A28 28 0 0 1 10 58V44A28 28 0 0 1 38 16Z';
const CAP = 'M28 25C38 5 76 2 93 19L99 25Z';
const FACES = {
  squint: html`<ellipse cx="44" cy="51" rx="9" ry="10" fill="#fff"/><circle cx="46" cy="53" r="4.5" fill="#152E40"/><ellipse cx="76" cy="53" rx="9" ry="5" fill="#fff"/><circle cx="77" cy="54" r="3.5" fill="#152E40"/><path d="M66 42L87 38" stroke="#CEFF52" stroke-width="3.5" stroke-linecap="round"/><path d="M50 70Q60 76 72 67" stroke="#CEFF52" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  magnifier: html`<ellipse cx="44" cy="51" rx="8" ry="9" fill="#fff"/><circle cx="46" cy="52" r="4" fill="#152E40"/><circle cx="78" cy="52" r="15" fill="#5CE1D6" fill-opacity="0.35" stroke="#5CE1D6" stroke-width="4"/><circle cx="78" cy="52" r="8" fill="#fff"/><circle cx="79" cy="53" r="5" fill="#152E40"/><path d="M89 63L104 79" stroke="#5CE1D6" stroke-width="6" stroke-linecap="round"/><circle cx="56" cy="72" r="4" fill="#CEFF52"/>`,
  raspberry: html`<path d="M37 45L49 51L37 57M83 45L71 51L83 57" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M54 68Q54 84 61 84Q68 84 68 68Z" fill="#FF7A66"/><path d="M46 68H76" stroke="#CEFF52" stroke-width="3.5" stroke-linecap="round"/>`,
  stars: html`<polygon points="44.0,40.0 46.7,47.3 54.5,47.6 48.4,52.4 50.5,59.9 44.0,55.6 37.5,59.9 39.6,52.4 33.5,47.6 41.3,47.3" fill="#CEFF52"/><polygon points="76.0,40.0 78.7,47.3 86.5,47.6 80.4,52.4 82.5,59.9 76.0,55.6 69.5,59.9 71.6,52.4 65.5,47.6 73.3,47.3" fill="#CEFF52"/><path d="M47 66Q60 80 74 66Z" fill="#fff" stroke="#CEFF52" stroke-width="3" stroke-linejoin="round"/>`,
  shrug: html`<path d="M37 50H51M69 50H83" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M47 70Q53 65 59 70Q65 75 71 70" stroke="#CEFF52" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  sleeping: html`<path d="M37 50Q44 57 51 50M69 50Q76 57 83 50" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="60" cy="71" r="3.5" fill="#CEFF52"/>`,
};
export function Blu({ face = 'squint', size = 48, label, cls = '' }) {
  return html`<svg class=${cls} width=${size} height=${Math.round(size * 0.93)} viewBox="0 0 120 112" role=${label ? 'img' : null} aria-label=${label || null} aria-hidden=${label ? null : 'true'}>
    <path d=${BODY} fill="#152E40" stroke="#CEFF52" stroke-width="4" stroke-linejoin="round"/>
    <path d=${CAP} fill="#CEFF52" stroke="#152E40" stroke-width="3" stroke-linejoin="round"/>
    ${FACES[face] || FACES.squint}
  </svg>`;
}

// ---------- small pieces ----------
export function OddsBar({ bps, labels = true }) {
  const p = pct(bps);
  return html`<div>
    <div class="bar" role="img" aria-label=${`${p}% fact, ${100 - p}% BalaBlu`}><span style=${`width:${p}%`}></span></div>
    ${labels && html`<div class="barlabels"><span>${p}% FACT</span><span>${100 - p}% BALABLU</span></div>`}
  </div>`;
}

export function Verdict({ outcome }) {
  if (outcome === 'Balablu') return html`<span class="tag" style="background:var(--coral)">BALABLU’D</span>`;
  if (outcome === 'Fact') return html`<span class="tag" style="background:var(--lime)">JURY: FACT</span>`;
  if (outcome === 'Unresolvable') return html`<span class="tag">JURY SPLIT</span>`;
  return null;
}

/** Lime highlight strength: brighter = surer. */
export function hlColor(bps) {
  const p = bps / 100;
  if (p >= 85) return '#CEFF52';
  if (p >= 65) return '#DFF79A';
  if (p >= 45) return '#EEFBC9';
  return '#F6F8EF';
}

export function Loading({ text = 'Blu is sniffing around…' }) {
  return html`<div class="row" style="padding:40px 0;justify-content:center"><${Blu} face="magnifier" size=${56} cls="bob"/><span class="muted">${text}</span></div>`;
}

export function Empty({ text }) {
  return html`<div class="row" style="padding:28px 0"><${Blu} face="sleeping" size=${50}/><span class="muted">${text}</span></div>`;
}

export function Sheet({ onClose, children, label }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  return html`<div class="sheet-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${label}>
      <div class="row" style="justify-content:flex-end;margin:-6px -6px 0 0"><button class="btn small" onClick=${onClose} aria-label="Close">✕</button></div>
      ${children}
    </div>
  </div>`;
}

// ---------- bet panel ----------
const PRACTICE = [50, 200, 500];
const REAL = [0.5, 1, 2];

export function BetPanel({ card, initialSide = 'Fact', onDone, compact = false }) {
  const c = card.claim;
  const hasUsdc = card.usdc_odds_bps != null;
  const [mode, setMode] = useState('practice');
  const [side, setSide] = useState(initialSide);
  const [amount, setAmount] = useState(200);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acct, setAcct] = useState(wallet.account());
  useEvent('wallet', () => setAcct(wallet.account()));
  const paused = card.status !== 'Open';
  const currency = mode === 'practice' ? 'Points' : 'Usdc';
  const units = Math.round(amount * ONE);
  const odds = mode === 'real' && hasUsdc ? card.usdc_odds_bps : card.points_odds_bps;

  useEffect(() => { setAmount(mode === 'practice' ? 200 : 1); }, [mode]);
  useEffect(() => {
    let live = true;
    setQuote(null);
    if (mode === 'real' && !hasUsdc) return;
    view('quote_buy', { claim_id: c.id, side, currency, amount: String(units) }).then((q) => live && setQuote(q)).catch((e) => console.warn('quote failed', e));
    return () => { live = false; };
  }, [side, amount, mode]);

  async function go() {
    setBusy(true);
    try {
      if (mode === 'practice') {
        await ensurePoints();
        const min = quote ? String(Math.floor(Number(quote.shares) * 0.97)) : null;
        await guest('buy', { claim_id: c.id, side, amount: String(units), min_shares: min });
        toast(`Called it ${side === 'Fact' ? 'FACT' : 'BALABLU'}! ${amount} pts in.`);
      } else {
        if (!acct) { await wallet.signIn(); return; }
        await wallet.call('buy', { claim_id: c.id, side, currency: 'Usdc', amount: String(units) });
        toast(`Called it ${side === 'Fact' ? 'FACT' : 'BALABLU'} with $${amount}.`);
      }
      emit('bet', { claim: c.id });
      onDone && onDone();
    } catch (e) {
      toast(friendly(e.message), true);
    } finally {
      setBusy(false);
    }
  }

  const unit = mode === 'practice' ? 'pts' : 'USDC';
  const win = quote ? fmt(quote.payout_if_right) : 'working it out…';
  return html`<div class="stack">
    <div class="seg" role="radiogroup" aria-label="Play with">
      <button role="radio" aria-checked=${mode === 'practice'} class=${mode === 'practice' ? 'on' : ''} onClick=${() => setMode('practice')}>Practice points</button>
      <button role="radio" aria-checked=${mode === 'real'} class=${mode === 'real' ? 'on' : ''} onClick=${() => setMode('real')}>Real money</button>
    </div>
    ${!compact && html`<b style="font-size:20px">Is it a fact, or BalaBlu?</b>`}
    <div class="callpair">
      <button class=${'call fact' + (side === 'Fact' ? ' picked' : '')} aria-pressed=${side === 'Fact'} onClick=${() => setSide('Fact')}>FACT<small>${pct(odds)}%</small></button>
      <button class=${'call bla' + (side === 'Balablu' ? ' picked' : '')} aria-pressed=${side === 'Balablu'} onClick=${() => setSide('Balablu')}>BALABLU<small>${100 - pct(odds)}%</small></button>
    </div>
    ${mode === 'real' && !hasUsdc
      ? html`<div class="payout">This claim is practice-only for now. Real-money markets open on claims we seed with USDC.</div>`
      : html`
        <span style="font-weight:700;font-size:14px">How much?</span>
        <div class="amounts">
          ${(mode === 'practice' ? PRACTICE : REAL).map((a) => html`<button class=${amount === a ? 'on' : ''} onClick=${() => setAmount(a)}>${mode === 'real' ? '$' : ''}${a}</button>`)}
        </div>
        <div class="payout">Bet <b class="mono">${amount} ${unit}</b> on ${side === 'Fact' ? 'FACT' : 'BALABLU'}.<br/>If you’re right, you get <b class="mono hl">${win} ${unit}</b>.</div>
        <button class="btn dark big" disabled=${busy || paused} onClick=${go}>
          ${paused ? 'Paused: the jury is working' : busy ? 'Placing your call…' : mode === 'real' && !acct ? 'Connect a wallet to bet' : `Call it ${side === 'Fact' ? 'FACT' : 'BALABLU'}`}
        </button>
        <span class="muted" style="font-size:13px;line-height:1.5">${mode === 'practice' ? 'Practice points are free. No wallet needed.' : 'Max $2 a bet while BalaBlu is new. Cash out any time before an audit.'}</span>`}
  </div>`;
}

export function BetSheet({ card, side, onClose }) {
  return html`<${Sheet} onClose=${onClose} label="Make your call">
    <div class="stack">
      <span class="kicker">${card.claim.page}</span>
      <p class="quote" style="margin:0;font-size:22px">“${card.claim.text}”</p>
      <${OddsBar} bps=${card.odds_bps}/>
      <${BetPanel} card=${card} initialSide=${side} onDone=${onClose} compact/>
      <a href=${`/claim/${card.claim.id}`} onClick=${onClose}>Open the claim page: rule, evidence, jury</a>
    </div>
  <//>`;
}

export function mount(App) {
  render(html`<${App}/>`, document.getElementById('app'));
}

export { guestId, fmt, pct };
