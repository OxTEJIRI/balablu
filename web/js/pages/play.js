import { useState, useEffect } from 'preact/hooks';
import { html, Blu, Loading, Empty, toast, emit, pct, fmt } from '../ui.js';
import { getCards, guest, ensurePoints, guestId, view, friendly } from '../data.js';

const STAKE = 50;
const today = () => new Date().toISOString().slice(0, 10);
function load(key, d) { try { return JSON.parse(localStorage.getItem(key)) ?? d; } catch { return d; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

/** Same 5 claims for everyone today (seeded by the date). */
function pickDaily(cards) {
  const open = cards.filter((c) => c.status === 'Open' && !c.last_outcome);
  let seed = [...today()].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  return [...open].sort(() => rnd() - 0.5).slice(0, 5);
}

export function Play() {
  const [cards, setCards] = useState(null);
  const [state, setState] = useState(() => load('balablu.daily', { day: today(), i: 0, picks: [] }));
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState(null);
  const streak = load('balablu.streak', { n: 0, last: null });

  useEffect(() => {
    getCards().then((c) => setCards(pickDaily(c)));
    view('get_wallet', { account_id: guestId() }).then((w) => setPoints(w.got_points ? w.points : String(1000e6)));
    if (state.day !== today()) setState({ day: today(), i: 0, picks: [] });
  }, []);
  useEffect(() => save('balablu.daily', state), [state]);

  if (!cards) return html`<div class="wrap"><${Loading}/></div>`;
  if (cards.length === 0) return html`<div class="wrap"><${Empty} text="No open claims right now. Come back soon!"/></div>`;
  const done = state.i >= cards.length;
  const card = cards[Math.min(state.i, cards.length - 1)];
  const pick = state.picks[state.i];

  async function call(side) {
    setBusy(true);
    try {
      await ensurePoints();
      await guest('buy', { claim_id: card.claim.id, side, amount: String(STAKE * 1e6) });
      const w = await view('get_wallet', { account_id: guestId() });
      setPoints(w.points);
      setState((s) => ({ ...s, picks: [...s.picks.slice(0, s.i), side] }));
      emit('bet', {});
    } catch (e) { toast(friendly(e.message), true); } finally { setBusy(false); }
  }
  function next() {
    const last = state.i + 1 >= cards.length;
    if (last) {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const s = load('balablu.streak', { n: 0, last: null });
      if (s.last !== today()) save('balablu.streak', { n: s.last === y ? s.n + 1 : 1, last: today() });
    }
    setState((s) => ({ ...s, i: s.i + 1 }));
  }

  const agree = pick ? (pick === 'Fact' ? pct(card.odds_bps) : 100 - pct(card.odds_bps)) : 0;
  return html`<div class="wrap" style="max-width:560px;padding-top:28px">
    <div class="stack" style="gap:16px">
      <div class="row" style="justify-content:space-between">
        <h1 class="h2">Daily Bla</h1>
        <span class="chip" style="background:var(--lime)">${load('balablu.streak', { n: 0 }).n}-day streak</span>
      </div>
      <div class="dots" aria-label=${`Claim ${Math.min(state.i + 1, cards.length)} of ${cards.length}`}>${cards.map((_, k) => html`<span class=${k < state.i ? 'done' : k === state.i ? 'now' : ''}></span>`)}</div>
      ${done ? html`<div class="card pop stack" style="align-items:center;text-align:center;padding:32px">
          <${Blu} face="stars" size=${110} label="Blu, happy"/>
          <b style="font-size:28px">Done for today!</b>
          <p class="muted" style="margin:0">You made ${state.picks.filter(Boolean).length} calls. The jury settles them at surprise times; collect winnings on your Me page.</p>
          <div class="row" style="justify-content:center"><a class="btn lime" href="/me">See my calls</a><a class="btn" href="/wiki">Read the encyclopedia</a></div>
        </div>`
      : html`<div class="playcard">
          <div class="back"></div>
          <div class="front">
            <span class="kicker">${card.claim.page} · ${state.i + 1} of ${cards.length}</span>
            <p class="quote" style="margin:16px 0 0">“${card.claim.text}”</p>
            <span class="spacer"></span>
            ${pick ? html`<div class="card stack" style="background:var(--paper);gap:8px;margin-top:16px">
                <span>You said <b class="tag" style=${`font-size:13px;background:${pick === 'Fact' ? 'var(--lime)' : 'var(--coral)'}`}>${pick === 'Fact' ? 'FACT' : 'BALABLU'}</b></span>
                <div class="row" style="gap:8px;align-items:baseline"><span class="mono" style="font-size:42px;font-weight:700">${agree}%</span><span class="muted">of bettors agree</span></div>
                <div class="bar"><span style=${`width:${pct(card.odds_bps)}%`}></span></div>
                <span class="muted" style="font-size:13px">The jury settles it at a surprise time. <a href=${`/claim/${card.claim.id}`}>Claim page</a></span>
              </div>`
            : html`<span class="muted" style="font-size:15px;margin-top:16px">Fact, or BalaBlu? Each call uses ${STAKE} free practice points.</span>`}
          </div>
        </div>
        ${pick ? html`<button class="btn dark big" onClick=${next}>${state.i + 1 >= cards.length ? 'Finish' : 'Next claim'}</button>`
          : html`<div class="callpair"><button class="call fact" disabled=${busy} onClick=${() => call('Fact')}>FACT</button><button class="call bla" disabled=${busy} onClick=${() => call('Balablu')}>BALABLU</button></div>`}`}
      <div class="row muted" style="justify-content:space-between;font-size:14px">
        <span>Practice <b class="mono" style="color:var(--ink)">${points == null ? '…' : fmt(points, 0)} pts</b></span>
        <a href="/ask">Not sure? Ask Blu</a>
      </div>
    </div>
  </div>`;
}
