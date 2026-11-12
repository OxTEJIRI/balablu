import { useState, useEffect } from 'preact/hooks';
import { html, Blu, Loading, Verdict, toast, emit, pct, fmt } from '../ui.js';
import { getCards, view, guest, guestId, ensurePoints, friendly } from '../data.js';
import * as wallet from '../wallet.js';

/** Practice calls of this device's guest, past and present. */
async function loadCalls(cards) {
  const g = guestId();
  const rows = [];
  await Promise.all(cards.map(async (c) => {
    for (let e = 0; e <= c.claim.epoch; e++) {
      const p = await view('get_position', { account_id: g, claim_id: c.claim.id, epoch: e, currency: 'Points' });
      if (p.fact === '0' && p.balablu === '0') continue;
      let market = null;
      if (e < c.claim.epoch) market = await view('get_market', { claim_id: c.claim.id, currency: 'Points', epoch: e });
      rows.push({ card: c, epoch: e, pos: p, market });
    }
  }));
  return rows.sort((a, b) => (a.market ? 0 : 1) - (b.market ? 0 : 1));
}

export function Me() {
  const [w, setW] = useState(null);
  const [calls, setCalls] = useState(null);
  const [busy, setBusy] = useState(null);
  const watched = (() => { try { return JSON.parse(localStorage.getItem('balablu.watch') || '[]'); } catch { return []; } })();
  const streak = (() => { try { return JSON.parse(localStorage.getItem('balablu.streak'))?.n || 0; } catch { return 0; } })();

  const load = async () => {
    const cards = await getCards(true);
    setW(await view('get_wallet', { account_id: guestId() }));
    setCalls(await loadCalls(cards));
  };
  useEffect(() => { load(); }, []);

  async function collect(row) {
    setBusy(row.card.claim.id + '-' + row.epoch);
    try {
      const r = await guest('redeem', { claim_id: row.card.claim.id, epoch: row.epoch });
      toast(Number(r.value) > 0 ? `Collected ${fmt(r.value, 0)} pts!` : 'That one did not pay out. Next time!');
      emit('bet', {});
      load();
    } catch (e) { toast(friendly(e.message), true); } finally { setBusy(null); }
  }

  if (!w || !calls) return html`<div class="wrap"><${Loading}/></div>`;
  const settled = calls.filter((r) => r.market);
  const wins = settled.filter((r) => (r.market.payout_fact_bps >= 5000 ? Number(r.pos.fact) > Number(r.pos.balablu) : Number(r.pos.balablu) > Number(r.pos.fact)));
  const hit = settled.length ? Math.round((wins.length / settled.length) * 100) : null;
  const badges = [
    w.got_points && ['Rookie', 'claimed your free points'],
    calls.length >= 5 && ['Caller', 'made 5 calls'],
    wins.some((r) => r.market.payout_fact_bps === 0) && ['Bla Buster', 'won on a BalaBlu’d claim'],
    streak >= 3 && ['On a roll', '3-day Daily Bla streak'],
  ].filter(Boolean);

  return html`<div class="wrap stack" style="padding-top:28px;gap:22px">
    <div class="row"><${Blu} face=${wins.length ? 'stars' : 'squint'} size=${60}/><div><h1 class="h2">My BalaBlu</h1><span class="muted mono" style="font-size:13px">guest ${guestId().slice(0, 9)}… on this device${wallet.account() ? ` · wallet ${wallet.account()}` : ''}</span></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${fmt(w.got_points ? w.points : 1000e6, 0)}</div><span class="muted">practice points${w.got_points ? '' : ' (waiting for you)'}</span></div>
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${calls.length}</div><span class="muted">calls</span></div>
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${hit == null ? '—' : hit + '%'}</div><span class="muted">truth score</span></div>
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${streak}</div><span class="muted">day streak</span></div>
    </div>
    ${!w.got_points && html`<div class="card lime row"><span style="flex:1">Your 1,000 free practice points are waiting. They’re added the moment you make your first call, or you can add them now.</span><button class="btn dark" onClick=${async () => { await ensurePoints(); load(); }}>Add them now</button></div>`}
    ${badges.length > 0 && html`<div class="row">${badges.map(([b, why]) => html`<span class="chip" title=${why}>${b}</span>`)}</div>`}
    <section class="card stack">
      <b style="font-size:19px">My calls</b>
      ${calls.length === 0 && html`<span class="muted">No calls yet. <a href="/play">Play today’s Daily Bla</a>.</span>`}
      ${calls.map((r) => {
        const settledRow = !!r.market;
        const fact = Number(r.pos.fact);
        const bla = Number(r.pos.balablu);
        const payout = settledRow ? Math.floor((fact * r.market.payout_fact_bps + bla * (10000 - r.market.payout_fact_bps)) / 10000) : null;
        return html`<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px">
          <a href=${`/claim/${r.card.claim.id}`} style="flex:1 1 300px;color:var(--ink)">“${r.card.claim.text}”</a>
          <span class="mono" style="font-size:13px">${fact > 0 ? `FACT ${fmt(fact, 0)}` : ''} ${bla > 0 ? `BALABLU ${fmt(bla, 0)}` : ''}</span>
          ${settledRow ? html`<button class="btn small lime" disabled=${busy} onClick=${() => collect(r)}>${payout > 0 ? `Collect ${fmt(payout, 0)} pts` : 'Clear'}</button>`
            : html`<span class="tag" style="background:var(--lime-2)">${pct(r.card.odds_bps)}% now</span>`}
        </div>`;
      })}
    </section>
    <section class="card stack">
      <b style="font-size:19px">Watchlist</b>
      ${watched.length === 0 ? html`<span class="muted">Tap ☆ Watch on any claim to keep an eye on it.</span>`
        : html`<${WatchList} ids=${watched}/>`}
    </section>
  </div>`;
}

function WatchList({ ids }) {
  const [cards, setCards] = useState([]);
  useEffect(() => { getCards().then((all) => setCards(all.filter((c) => ids.includes(c.claim.id)))); }, []);
  const seen = (() => { try { return JSON.parse(localStorage.getItem('balablu.seen') || '{}'); } catch { return {}; } })();
  useEffect(() => {
    if (!cards.length) return;
    const next = Object.fromEntries(cards.map((c) => [c.claim.id, c.odds_bps]));
    try { localStorage.setItem('balablu.seen', JSON.stringify(next)); } catch { /* ignore */ }
  }, [cards]);
  return cards.map((c) => {
    const before = seen[c.claim.id];
    const move = before == null ? 0 : pct(c.odds_bps) - pct(before);
    return html`<a href=${`/claim/${c.claim.id}`} class="row" style="justify-content:space-between;color:var(--ink);text-decoration:none;border-top:1px solid var(--line);padding-top:10px">
      <span>“${c.claim.text}”</span>
      <span class="row" style="gap:6px">${move !== 0 && html`<span class="tag" style=${`background:${move > 0 ? 'var(--lime)' : 'var(--coral-2)'}`}>${move > 0 ? '▲' : '▼'} ${Math.abs(move)} pts since last visit</span>`}${c.last_outcome ? html`<${Verdict} outcome=${c.last_outcome}/>` : html`<span class="tag">${pct(c.odds_bps)}%</span>`}</span>
    </a>`;
  });
}
