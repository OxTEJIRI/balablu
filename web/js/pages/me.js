import { useState, useEffect } from 'preact/hooks';
import { html, Blu, Loading, Verdict, toast, emit, useEvent, pct, fmt } from '../ui.js';
import { getCards, view, guest, guestId, ensurePoints, friendly, getPositions, betLog, recordResult, resultHistory } from '../data.js';
import { EXPLORER } from '../config.js';
import * as wallet from '../wallet.js';

// ---------- maths (same as the contract) ----------
const isqrt = (n) => { if (n < 2n) return n; let x = n; let y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; };
const sqrtCeil = (n) => { const r = isqrt(n); return r * r === n ? r : r + 1n; };
/** What you would get for selling `shares` of a side right now (after the 1% fee). */
function sellEstimate(market, sideKey, shares) {
  const a = BigInt(sideKey === 'Fact' ? market.fact_reserve : market.balablu_reserve);
  const b = BigInt(sideKey === 'Fact' ? market.balablu_reserve : market.fact_reserve);
  const s = BigInt(shares);
  const sum = a + s + b;
  const r = (sum - sqrtCeil(sum * sum - 4n * s * b)) / 2n;
  return r - (r * 100n) / 10000n;
}

const money = (r, n) => (r.currency === 'Usdc' ? `$${fmt(n)}` : `${fmt(n, 0)} pts`);
const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

/** Everything a person needs to know about one bet, in plain words. */
function analyse(r) {
  const fact = BigInt(r.fact);
  const bla = BigInt(r.balablu);
  const spent = BigInt(r.spent);
  const side = fact > 0n && bla === 0n ? 'FACT' : bla > 0n && fact === 0n ? 'BALABLU' : 'FACT and BALABLU';
  const ifRight = fact > bla ? fact : bla;
  if (r.resolved) {
    const bps = BigInt(r.payout_fact_bps);
    const payout = (fact * bps + bla * (10000n - bps)) / 10000n;
    const split = bps !== 0n && bps !== 10000n;
    const ruled = split ? 'The jury was split' : bps === 10000n ? 'The jury ruled FACT' : 'The jury ruled BALABLU';
    if (split) return { kind: 'split', chip: 'REFUND', side, payout, spent, line: `${ruled}, so you get your money back at the last odds: ${money(r, payout)}.` };
    if (payout > 0n) return { kind: 'won', chip: 'YOU WON', side, payout, spent, line: `${ruled}. You called ${side}, so you won ${money(r, payout)}${payout > spent ? ` (${money(r, payout - spent)} profit)` : ''}.` };
    return { kind: 'lost', chip: 'YOU LOST', side, payout, spent, line: `${ruled}. You called ${side}, so this bet lost. Nothing to collect, but you can clear it.` };
  }
  if (r.card.status !== 'Open') return { kind: 'jury', chip: 'JURY AT WORK', side, spent, ifRight, line: `You called ${side}. The jury is deciding right now. You will see the result here in a minute.` };
  return { kind: 'open', chip: 'OPEN', side, spent, ifRight, line: `You called ${side}. If you are right you get ${money(r, ifRight)}. The jury rules at a surprise time.` };
}

export function Me() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [acct, setAcct] = useState(wallet.account());
  useEvent('wallet', (a) => setAcct(a));
  const watched = (() => { try { return JSON.parse(localStorage.getItem('balablu.watch') || '[]'); } catch { return []; } })();
  const streak = (() => { try { return JSON.parse(localStorage.getItem('balablu.streak'))?.n || 0; } catch { return 0; } })();

  const load = async () => {
    const g = guestId();
    const [cards, gpos, gw] = await Promise.all([getCards(true), getPositions(g), view('get_wallet', { account_id: g })]);
    let wpos = [];
    let ww = null;
    if (acct) [wpos, ww] = await Promise.all([getPositions(acct), view('get_wallet', { account_id: acct })]);
    const byId = new Map(cards.map((c) => [c.claim.id, c]));
    const rows = [...gpos.map((p) => ({ ...p, owner: 'guest' })), ...wpos.map((p) => ({ ...p, owner: 'wallet' }))]
      .filter((r) => byId.has(r.claim_id))
      .map((r) => ({ ...r, card: byId.get(r.claim_id) }));
    // current market for open bets, so we can offer "cash out early" with a real number
    await Promise.all(rows.filter((r) => !r.resolved && r.card.status === 'Open').map(async (r) => {
      r.market = await view('get_market', { claim_id: r.claim_id, currency: r.currency }).catch(() => null);
    }));
    setData({ rows, gw, ww });
  };
  useEffect(() => { load(); }, [acct]);
  useEvent('bet', load);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); await load(); emit('bet', {}); } catch (e) { toast(friendly(e.message), true); } finally { setBusy(null); }
  };
  const collect = (r) => run(`${r.claim_id}-${r.epoch}-${r.currency}`, async () => {
    const a = analyse(r);
    if (r.owner === 'guest') await guest('redeem', { claim_id: r.claim_id, epoch: r.epoch });
    else await wallet.call('redeem', { claim_id: r.claim_id, epoch: r.epoch, currency: r.currency });
    recordResult({ claim: r.card.claim.text, claim_id: r.claim_id, side: a.side, spent: Number(r.spent), payout: Number(a.payout), currency: r.currency, kind: a.kind });
    toast(a.payout > 0n ? `✓ Collected ${money(r, a.payout)}. It is in your balance.` : '✓ Cleared. Better luck next time!');
  });
  const cashOut = (r, est) => run(`${r.claim_id}-${r.epoch}-${r.currency}`, async () => {
    for (const [side, shares] of [['Fact', r.fact], ['Balablu', r.balablu]]) {
      if (shares === '0') continue;
      if (r.owner === 'guest') await guest('sell', { claim_id: r.claim_id, side, shares });
      else await wallet.call('sell', { claim_id: r.claim_id, side, currency: r.currency, shares, min_out: String((sellEstimate(r.market, side, shares) * 97n) / 100n) });
    }
    toast(`✓ Cashed out about ${money(r, est)}.`);
  });

  if (!data) return html`<div class="wrap"><${Loading}/></div>`;
  const { rows, gw, ww } = data;
  const analysed = rows.map((r) => ({ r, a: analyse(r) }));
  const waiting = analysed.filter((x) => x.a.kind === 'open' || x.a.kind === 'jury');
  const settled = analysed.filter((x) => ['won', 'lost', 'split'].includes(x.a.kind));
  const ready = settled.filter((x) => x.a.kind !== 'lost');
  const history = resultHistory();
  const log = betLog();
  const decided = history.filter((h) => h.kind === 'won' || h.kind === 'lost').length + settled.filter((x) => x.a.kind === 'won' || x.a.kind === 'lost').length;
  const won = history.filter((h) => h.kind === 'won').length + settled.filter((x) => x.a.kind === 'won').length;
  const truth = decided ? `${Math.round((won / decided) * 100)}%` : '—';
  const badges = [
    gw.got_points && ['Rookie', 'claimed your free points'],
    rows.length + history.length >= 5 && ['Caller', 'made 5 bets'],
    won >= 1 && ['Winner', 'won a bet'],
    streak >= 3 && ['On a roll', '3-day Daily Bla streak'],
  ].filter(Boolean);

  const Row = ({ x }) => {
    const { r, a } = x;
    const key = `${r.claim_id}-${r.epoch}-${r.currency}`;
    const est = r.market && a.kind === 'open' ? [['Fact', r.fact], ['Balablu', r.balablu]].reduce((s, [side, sh]) => (sh === '0' ? s : s + sellEstimate(r.market, side, sh)), 0n) : null;
    return html`<div class="bet">
      <div class="stack" style="gap:6px;flex:1 1 320px;min-width:0">
        <div class="row" style="gap:8px"><span class=${`status ${a.kind === 'split' ? 'split' : a.kind}`}>${a.chip}</span>
          <span class="chip ${r.currency === 'Usdc' ? 'dark' : 'white'}" style="font-size:11px;padding:3px 8px">${r.currency === 'Usdc' ? 'REAL MONEY' : 'PRACTICE'}</span>
          <span class="muted mono" style="font-size:12px">${r.card.claim.page} · round ${r.epoch + 1}</span></div>
        <a href=${`/claim/${r.claim_id}`} class="serif" style="color:var(--ink);font-size:18px;font-weight:600;line-height:1.35;text-decoration:none">“${r.card.claim.text}”</a>
        <span style="font-size:15px;line-height:1.5">${a.line} <span class="muted">You put in ${money(r, a.spent)}.</span></span>
        ${a.kind === 'jury' && r.card.claim.active_audit != null && html`<a href=${`/audit/${r.card.claim.active_audit}`} style="font-size:14px">Watch the jury →</a>`}
      </div>
      <div class="row" style="gap:8px">
        ${a.kind === 'open' && est != null && html`<button class="btn small" disabled=${busy === key} title="Sell your bet now at the current odds" onClick=${() => confirm(`Cash out now for about ${money(r, est)}?\n\nYou give up the chance to win ${money(r, a.ifRight)}.`) && cashOut(r, est)}>${busy === key ? 'Working…' : `Cash out early (≈ ${money(r, est)})`}</button>`}
        ${(a.kind === 'won' || a.kind === 'split') && html`<button class="btn lime" disabled=${busy === key} onClick=${() => collect(r)}>${busy === key ? 'Collecting…' : `Collect ${money(r, a.payout)}`}</button>`}
        ${a.kind === 'lost' && html`<button class="btn small" disabled=${busy === key} onClick=${() => collect(r)}>Clear this bet</button>`}
      </div>
    </div>`;
  };

  return html`<div class="wrap stack" style="padding-top:28px;gap:22px;max-width:980px">
    <div class="row"><${Blu} face=${won ? 'stars' : 'squint'} size=${60}/><div><h1 class="h2">My bets</h1>
      <span class="muted" style="font-size:14px">Every bet you make shows up here, whether you placed it on the home page, in Daily Bla or on a claim page.</span></div></div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${fmt(gw.got_points ? gw.points : 1000e6, 0)}</div><span class="muted">practice points${gw.got_points ? '' : ' (waiting for you)'}</span></div>
      ${acct && ww && html`<div class="card"><div class="mono" style="font-size:26px;font-weight:700">$${fmt(ww.usdc)}</div><span class="muted">real USDC in BalaBlu</span></div>`}
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${waiting.length}</div><span class="muted">bets waiting</span></div>
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${truth}</div><span class="muted">truth score</span></div>
      <div class="card"><div class="mono" style="font-size:26px;font-weight:700">${streak}</div><span class="muted">day streak</span></div>
    </div>

    ${ready.length > 0 && html`<div class="card lime row" role="status"><${Blu} face="stars" size=${46}/><b style="flex:1;font-size:18px">You have ${ready.length} bet${ready.length > 1 ? 's' : ''} ready to collect. Scroll down and press Collect.</b></div>`}
    ${!gw.got_points && html`<div class="card lime row"><span style="flex:1">Your 1,000 free practice points are waiting. They are added the moment you place your first bet, or you can add them now.</span><button class="btn dark" onClick=${async () => { await ensurePoints(); load(); }}>Add them now</button></div>`}
    ${acct ? html`<div class="muted" style="font-size:13px">Showing bets from this device and from your wallet <b class="mono">${acct}</b>.</div>`
      : html`<div class="muted" style="font-size:13px">Showing practice bets from this device. <a href="/money">Connect a wallet</a> to see real-money bets here too.</div>`}

    <details class="card" open=${rows.length === 0}>
      <summary style="cursor:pointer;font-weight:800;font-size:18px">How bets work, in 30 seconds</summary>
      <ol class="next" style="margin-top:10px"><li><b>You call it.</b> Press FACT (you think it’s true) or BALABLU (you think it’s nonsense) and choose an amount.</li>
        <li><b>The jury rules.</b> At a surprise time, three sealed AIs read the evidence and vote. Betting on that claim pauses meanwhile.</li>
        <li><b>You collect.</b> If you were right, your bet turns green here. Press <b>Collect</b> and the winnings land in your balance. If you were wrong, you lose the amount you bet.</li>
        <li><b>Changed your mind?</b> Before the jury rules, press <b>Cash out early</b> to sell your bet at the current odds.</li></ol>
    </details>

    <section class="card stack" style="gap:14px">
      <b style="font-size:19px">Waiting for a verdict (${waiting.length})</b>
      ${waiting.length === 0 && html`<span class="muted">Nothing waiting. <a href="/play">Play today’s Daily Bla</a> or <a href="/wiki">pick a claim</a> to make a bet.</span>`}
      ${waiting.map((x) => html`<${Row} x=${x}/>`)}
    </section>

    <section class="card stack" style="gap:14px">
      <b style="font-size:19px">Settled: collect your winnings (${settled.length})</b>
      ${settled.length === 0 && html`<span class="muted">No settled bets yet. When the jury rules on a claim you bet on, it appears here.</span>`}
      ${settled.map((x) => html`<${Row} x=${x}/>`)}
    </section>

    <section class="card stack" style="gap:12px">
      <b style="font-size:19px">Past results (collected on this device)</b>
      ${history.length === 0 && html`<span class="muted">Collected bets are listed here so you can look back.</span>`}
      ${history.slice(0, 12).map((h) => html`<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px;font-size:15px">
        <span style="flex:1 1 300px">“${h.claim}” <span class="muted">· you called ${h.side}</span></span>
        <span class="row" style="gap:8px"><span class=${`status ${h.kind === 'split' ? 'split' : h.kind}`}>${h.kind === 'won' ? 'WON' : h.kind === 'lost' ? 'LOST' : 'REFUND'}</span><span class="muted" style="font-size:13px">${ago(h.ts)}</span></span></div>`)}
    </section>

    <section class="card stack" style="gap:12px">
      <b style="font-size:19px">Recent activity on this device</b>
      ${log.length === 0 && html`<span class="muted">When you place a bet, a receipt is saved here.</span>`}
      ${log.slice(0, 10).map((l) => html`<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px;font-size:15px">
        <span style="flex:1 1 300px">✓ You called <b>${l.side === 'Fact' ? 'FACT' : 'BALABLU'}</b> with <b>${l.currency === 'Usdc' ? `$${l.amount}` : `${l.amount} pts`}</b> on “${l.claim}”</span>
        <span class="row" style="gap:10px"><span class="muted" style="font-size:13px">${ago(l.ts)}</span>${l.tx && html`<a style="font-size:13px" target="_blank" rel="noopener" href=${`${EXPLORER}/txns/${l.tx}`}>receipt ↗</a>`}</span></div>`)}
    </section>

    ${badges.length > 0 && html`<div class="row">${badges.map(([b, why]) => html`<span class="chip" title=${why}>${b}</span>`)}</div>`}
    <section class="card stack">
      <b style="font-size:19px">Watchlist</b>
      ${watched.length === 0 ? html`<span class="muted">Tap ☆ Watch on any claim to keep an eye on it.</span>` : html`<${WatchList} ids=${watched}/>`}
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
    try {
      localStorage.setItem('balablu.seen', JSON.stringify(next));
      const v = JSON.parse(localStorage.getItem('balablu.seenv') || '{}');
      cards.forEach((c) => { if (c.last_audit != null) v[c.claim.id] = c.last_audit; });
      localStorage.setItem('balablu.seenv', JSON.stringify(v));
    } catch { /* ignore */ }
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
