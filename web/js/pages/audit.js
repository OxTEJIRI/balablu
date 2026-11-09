import { useState, useEffect } from 'preact/hooks';
import { html, Blu, Loading, Empty, Verdict, toast, pct, fmt } from '../ui.js';
import { view, shortModel, slug, friendly } from '../data.js';
import { verifyVote } from '../verify.js';
import { DATA, EXPLORER, CONTRACT } from '../config.js';
import * as wallet from '../wallet.js';

const WORD = { Fact: 'FACT', Balablu: 'BALABLU', Unsure: 'UNSURE' };
const STATUS = {
  AwaitingJury: 'The jury is reading the evidence…',
  AwaitingPanel: 'Appealed! A 5-model panel is reading the evidence…',
  AppealWindow: 'Verdict is in. Anyone can appeal before the window closes.',
  CouncilWindow: 'Panel verdict is in. The council has a last look.',
  Final: 'Final. Winners have been paid.',
  Cancelled: 'Cancelled: the jury did not answer in time. Fees were refunded.',
};

export function Audit({ id }) {
  const [a, setA] = useState(null);
  const [claim, setClaim] = useState(null);
  const [shown, setShown] = useState(0);
  const [checks, setChecks] = useState({});
  const [tx, setTx] = useState({});
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    const audit = await view('get_audit', { audit_id: id });
    setA(audit || false);
    if (!audit) return;
    view('get_claim', { claim_id: audit.claim_id }).then(setClaim);
    for (const r of [1, 2]) fetch(`${DATA}/audits/${id}/r${r}/submitted.json`).then((x) => (x.ok ? x.json() : null)).then((j) => j && setTx((t) => ({ ...t, [r]: j.tx }))).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); if (a && /Awaiting/.test(a.status)) load(); }, 5000);
    return () => clearInterval(t);
  }, [a?.status]);
  // the show: reveal votes one by one
  useEffect(() => {
    if (!a) return;
    if (shown >= a.votes.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : 900);
    return () => clearTimeout(t);
  }, [a, shown]);

  if (a === false) return html`<div class="wrap"><${Empty} text="No such audit."/></div>`;
  if (!a || !claim) return html`<div class="wrap"><${Loading}/></div>`;

  const rounds = [1, 2].map((r) => a.votes.filter((v) => v.round === r)).filter((l) => l.length);
  const revealing = shown < a.votes.length;
  const final = a.outcome && !revealing;
  const face = !final ? 'magnifier' : a.outcome === 'Balablu' ? 'raspberry' : a.outcome === 'Fact' ? 'stars' : 'shrug';
  const left = Math.max(0, a.deadline_ms - now);

  async function verifyAll() {
    for (const v of a.votes) {
      const key = `${v.round}-${v.model}`;
      setChecks((c) => ({ ...c, [key]: 'checking' }));
      const r = await verifyVote(id, v.round, v);
      setChecks((c) => ({ ...c, [key]: r }));
    }
  }
  async function act(method) {
    try {
      if (!wallet.account()) return wallet.signIn();
      await wallet.call(method, { audit_id: id });
      toast(method === 'appeal' ? 'Appeal sent! The 5-model panel will be called.' : 'Done.');
      load();
    } catch (e) { toast(friendly(e.message), true); }
  }

  let idx = 0;
  return html`<div class="wrap stack" style="padding-top:28px;gap:22px">
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div class="stack" style="gap:8px;flex:1 1 520px">
        <span class="kicker">${a.kind === 'Surprise' ? 'Surprise audit' : 'Requested audit'} #${a.id} · <a href=${`/wiki/${slug(claim.page)}`}>${claim.page}</a></span>
        <h1 class="serif" style="font-weight:600;font-size:clamp(26px,3.2vw,38px);line-height:1.25">“${claim.text}”</h1>
      </div>
      <span class="chip dark">${a.status === 'Final' ? 'FINAL' : 'LIVE'}</span>
    </div>
    <p class="muted" style="margin:0;font-size:16px">${STATUS[a.status]}${(a.status === 'AppealWindow' || a.status === 'CouncilWindow') && left > 0 ? ` (${Math.ceil(left / 1000)} s left)` : ''}</p>

    <section class="card navy stack" style="padding:26px;gap:20px">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
        <${Blu} face=${face} size=${78} cls=${final ? '' : 'bob'} label="Blu"/>
        <div><b style="font-size:24px">Three AIs, three sealed boxes.</b>
          <p style="margin:4px 0 0;font-size:16px;line-height:1.5;color:#C9D6DF">Each model runs inside a locked chip (a TEE) that nobody, not even us, can peek into. They read the same question, written by the contract itself, and every answer comes back signed.</p></div>
      </div>
      ${a.votes.length === 0 && html`<div class="row" style="color:#C9D6DF"><${Blu} face="magnifier" size=${40} cls="bob"/>Waiting for the jury’s signed answers…</div>`}
      ${rounds.map((votes) => html`<div class="stack" style="gap:10px">
        <span class="kicker" style="color:var(--lime)">${votes[0].round === 1 ? 'Round 1 · jury of 3' : 'Round 2 · appeal panel of 5'}</span>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">
          ${votes.map((v) => {
            const visible = idx++ < shown;
            const chk = checks[`${v.round}-${v.model}`];
            return html`<div class="juror">
              <div class="row" style="justify-content:space-between"><b style="font-size:16px">${shortModel(v.model)}</b><span class="tag" style="background:var(--aqua-2)">SEALED</span></div>
              <div class=${'vote ' + (visible ? v.verdict : '')}>${visible ? WORD[v.verdict] : '…'}</div>
              ${visible && html`<span class="serif" style="font-size:15px;line-height:1.5">“${v.reason}”</span>`}
              <span class="mono" style="font-size:12px;color:var(--teal);font-weight:700">✓ signature checked by the contract</span>
              ${chk === 'checking' && html`<span class="mono" style="font-size:12px">checking in your browser…</span>`}
              ${chk && chk !== 'checking' && html`<div class="stack" style="gap:4px;font-size:12px">${chk.steps.map((s) => html`<span>${s.ok ? '✓' : '✗'} ${s.label}</span>`)}</div>`}
            </div>`;
          })}
        </div>
      </div>`)}
    </section>

    ${final && html`<div class="row" style="gap:20px;align-items:stretch">
      <section class=${'card pop row ' + (a.outcome === 'Balablu' ? 'coral' : 'lime')} style="flex:1 1 420px;flex-wrap:nowrap;gap:18px">
        <${Blu} face=${face} size=${92}/>
        <div>
          <span class="kicker" style="color:var(--ink)">Verdict · ${a.votes.filter((v) => v.round === (rounds.length)).filter((v) => v.verdict === a.outcome).length} of ${rounds[rounds.length - 1].length}${a.council_overruled ? ' · council overruled' : ''}</span>
          <div style="font-weight:800;font-size:44px;letter-spacing:-1.5px;line-height:1.05">${a.outcome === 'Balablu' ? 'BalaBlu’d!' : a.outcome === 'Fact' ? 'It’s a FACT!' : 'Jury split'}</div>
          <span style="font-size:16px">${a.outcome === 'Unresolvable' ? 'Everyone gets refunded at the last odds.' : `${WORD[a.outcome]} callers get paid. A new round opens near the verdict.`}</span>
        </div>
      </section>
      <section class="card stack" style="flex:1 1 420px;gap:10px">
        <b style="font-size:19px">What the contract checked</b>
        ${['Each vote was signed inside a registered sealed chip.', 'The signed question is exactly the one the contract wrote: claim, rule, frozen evidence, temperature 0.', 'Each vote is tied to this audit and round, so it cannot be reused.', 'One vote per model, and every model on the list voted.'].map((t) => html`<div class="check"><span class="dot">✓</span>${t}</div>`)}
        <div class="row" style="margin-top:6px;gap:8px">
          <button class="btn small lime" onClick=${verifyAll}>Verify it yourself</button>
          ${Object.entries(tx).map(([r, h]) => html`<a class="btn small" target="_blank" rel="noopener" href=${`${EXPLORER}/txns/${h}`}>Round ${r} on NEAR</a>`)}
        </div>
        <span class="muted" style="font-size:13px">“Verify it yourself” downloads the exact signed files and re-checks the hashes and enclave signatures in your browser.</span>
      </section>
    </div>`}

    ${a.status === 'AppealWindow' && html`<div class="card row"><${Blu} face="shrug" size=${44}/><span style="flex:1">Think the jury got it wrong? Post a 2 USDC bond to send it to the 5-model panel. You get it back if the panel changes the result.</span><button class="btn coral" onClick=${() => act('appeal')}>Appeal</button></div>`}
    ${(a.status === 'AppealWindow' || a.status === 'CouncilWindow') && left === 0 && html`<div class="card row"><span style="flex:1">The window has closed. Anyone can finalize to pay the winners.</span><button class="btn lime" onClick=${() => act('finalize')}>Finalize</button></div>`}
    <div class="card stack" style="gap:8px">
      <b>Evidence root</b>
      <span class="mono" style="font-size:12px;word-break:break-all">${a.evidence_root}</span>
      <span class="muted" style="font-size:13px">The SHA-256 of the evidence frozen when the audit started (${a.evidence_ids.length} sources). It is part of the signed question.</span>
    </div>
  </div>`;
}
