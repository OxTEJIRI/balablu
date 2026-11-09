import { useState, useEffect } from 'preact/hooks';
import { html, Blu, OddsBar, BetPanel, Loading, Empty, Verdict, useEvent, toast, pct, fmt } from '../ui.js';
import { getCards, view, slug, friendly } from '../data.js';
import * as wallet from '../wallet.js';

const watched = () => { try { return JSON.parse(localStorage.getItem('balablu.watch') || '[]'); } catch { return []; } };
const setWatched = (l) => { try { localStorage.setItem('balablu.watch', JSON.stringify(l)); } catch { /* ignore */ } };

export function shareText(card) {
  const p = pct(card.odds_bps);
  if (card.last_outcome === 'Balablu') return `“${card.claim.text}” just got BalaBlu’d by a jury of 3 sealed AIs, checked on NEAR.`;
  return `“${card.claim.text}” — ${p}% say FACT on BalaBlu. Is it, or is it BalaBlu?`;
}

export function Claim({ id }) {
  const [card, setCard] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [audits, setAudits] = useState([]);
  const [watch, setWatch] = useState(watched().includes(id));
  const [adding, setAdding] = useState(false);
  const duel = new URLSearchParams(location.search).get('duel');

  const load = async () => {
    const cards = await getCards(true);
    const c = cards.find((x) => x.claim.id === id);
    setCard(c || false);
    if (!c) return;
    view('get_evidence', { claim_id: id }).then(setEvidence);
    Promise.all(c.claim.audits.map((a) => view('get_audit', { audit_id: a }))).then((l) => setAudits(l.reverse()));
  };
  useEffect(() => { load(); }, [id]);
  useEvent('bet', load);

  if (card === false) return html`<div class="wrap"><${Empty} text="That claim doesn’t exist (yet)."/></div>`;
  if (!card) return html`<div class="wrap"><${Loading}/></div>`;
  const c = card.claim;
  const url = `${location.origin}/claim/${c.id}`;

  function toggleWatch() {
    const l = watched();
    const next = l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
    setWatched(next);
    setWatch(next.includes(id));
    toast(next.includes(id) ? 'Watching. Blu will flag moves on your Me page.' : 'Stopped watching.');
  }
  async function copyDuel(side) {
    const link = `${url}?duel=${side}`;
    try { await navigator.clipboard.writeText(link); toast('Duel link copied. Send it to a friend!'); } catch { prompt('Copy this duel link', link); }
  }
  async function requestAudit() {
    try {
      if (!wallet.account()) return wallet.signIn();
      await wallet.call('request_audit', { claim_id: c.id });
      toast('Audit requested! The jury will be called shortly.');
      load();
    } catch (e) { toast(friendly(e.message), true); }
  }

  return html`<div class="wrap stack" style="padding-top:28px;gap:22px">
    <div class="muted" style="font-size:14px"><a href=${`/wiki/${slug(c.page)}`}>${c.page}</a> › Claim #${c.id}</div>
    ${duel && html`<div class="card lime row"><${Blu} face="squint" size=${44}/><b>Your friend called it ${duel === 'Balablu' ? 'BALABLU' : 'FACT'}. Do you agree? Pick a side below; the jury settles who was right.</b></div>`}
    <div class="row" style="gap:28px;align-items:flex-start">
      <div class="stack" style="flex:999 1 520px;min-width:0;gap:20px">
        <h1 class="serif" style="font-weight:600;font-size:clamp(28px,3.4vw,40px);line-height:1.25;letter-spacing:-.5px">“${c.text}”</h1>
        <div class="row" style="gap:8px">
          <span class="chip" style="background:var(--lime)">${pct(card.odds_bps)}% FACT</span>
          ${card.status !== 'Open' && html`<span class="chip dark">JURY AT WORK</span>`}
          <span class="chip white">${fmt(card.volume_points, 0)} pts in play</span>
          ${card.usdc_odds_bps != null && html`<span class="chip white">$${fmt(card.volume_usdc)} real money</span>`}
          ${card.last_outcome && html`<${Verdict} outcome=${card.last_outcome}/>`}
          <span class="chip aqua">Round ${c.epoch + 1}</span>
        </div>
        <div class="card"><${OddsBar} bps=${card.odds_bps}/></div>
        <div class="card stack" style="gap:8px">
          <b style="font-size:18px">How the jury decides</b>
          <p class="serif" style="margin:0;font-size:17px;line-height:1.6">${c.rule}</p>
          <span class="muted" style="font-size:14px">Audits happen at surprise times, or when someone pays to request one. Betting pauses while the jury works.</span>
        </div>
        <div class="card stack" style="gap:10px">
          <div class="row" style="justify-content:space-between"><b style="font-size:18px">Evidence the jury will read</b>
            <button class="btn small aqua" onClick=${() => setAdding(!adding)}>${adding ? 'Close' : 'Add a source'}</button></div>
          ${adding && html`<${AddEvidence} claimId=${c.id} onDone=${() => { setAdding(false); load(); }}/>`}
          ${evidence.length === 0 && html`<span class="muted">No sources yet. Be the first: the jury reads every source at the next audit.</span>`}
          ${evidence.map((e) => html`<div style="border-top:1px solid var(--line);padding-top:10px" class="stack">
            <span class="serif" style="font-size:16px;line-height:1.5">“${e.quote}”</span>
            <div class="row muted" style="font-size:13px;justify-content:space-between">
              <a href=${e.url} target="_blank" rel="noopener noreferrer">${e.url.replace(/^https:\/\//, '').slice(0, 60)}</a>
              <span>added by ${e.by.replace('.testnet', '')} ${e.uses > 0 ? html`<span class="tag" style="background:var(--aqua-2)">READ BY JURY ×${e.uses}</span>` : ''}</span>
            </div>
          </div>`)}
        </div>
        <div class="card stack" style="gap:10px">
          <b style="font-size:18px">Jury history</b>
          ${audits.length === 0 && html`<span class="muted">No audits yet. Request one, or wait for a surprise.</span>`}
          ${audits.map((a) => html`<a href=${`/audit/${a.id}`} class="row" style="justify-content:space-between;color:var(--ink);text-decoration:none;border-top:1px solid var(--line);padding-top:10px">
            <span><b>Audit #${a.id}</b> · ${a.kind === 'Surprise' ? 'surprise' : 'requested'} · ${new Date(a.started_ms).toLocaleString()}</span>
            <span>${a.outcome ? html`<${Verdict} outcome=${a.outcome}/>` : html`<span class="tag">${a.status}</span>`}</span>
          </a>`)}
        </div>
      </div>
      <aside class="card pop stack" style="flex:1 1 340px;min-width:0;padding:22px">
        <${BetPanel} card=${card} initialSide=${duel === 'Balablu' ? 'Fact' : duel === 'Fact' ? 'Balablu' : 'Fact'} onDone=${load}/>
        <div class="row" style="border-top:1px solid var(--line);padding-top:14px;gap:8px">
          <button class="btn small" onClick=${() => copyDuel('Fact')}>Duel a friend</button>
          <a class="btn small" target="_blank" rel="noopener" href=${`https://x.com/intent/post?text=${encodeURIComponent(shareText(card))}&url=${encodeURIComponent(url)}`}>Share on X</a>
          <button class="btn small" aria-pressed=${watch} onClick=${toggleWatch}>${watch ? '★ Watching' : '☆ Watch'}</button>
          ${card.status === 'Open' && html`<button class="btn small" onClick=${requestAudit} title="0.5 USDC, needs a wallet">Request an audit</button>`}
        </div>
      </aside>
    </div>
  </div>`;
}

function AddEvidence({ claimId, onDone }) {
  const [url, setUrl] = useState('https://');
  const [quote, setQuote] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (!wallet.account()) return wallet.signIn();
    setBusy(true);
    try {
      await wallet.call('add_evidence', { claim_id: claimId, url, quote }, { deposit: '10000000000000000000000' });
      toast('Source added. The jury will read it at the next audit.');
      onDone();
    } catch (err) { toast(friendly(err.message), true); } finally { setBusy(false); }
  }
  return html`<form class="stack" onSubmit=${save} style="gap:10px">
    <label class="stack" style="gap:4px"><b style="font-size:14px">Link (https)</b><input required value=${url} onInput=${(e) => setUrl(e.target.value)} style="height:44px;border:2px solid var(--ink);border-radius:12px;padding:0 12px;font:inherit"/></label>
    <label class="stack" style="gap:4px"><b style="font-size:14px">Quote from the source (max 1,200 characters)</b><textarea required maxlength="1200" rows="3" value=${quote} onInput=${(e) => setQuote(e.target.value)} style="border:2px solid var(--ink);border-radius:12px;padding:10px 12px;font:inherit"></textarea></label>
    <button class="btn dark" disabled=${busy}>${wallet.account() ? (busy ? 'Adding…' : 'Add source (0.01 NEAR)') : 'Connect a wallet to add sources'}</button>
  </form>`;
}
