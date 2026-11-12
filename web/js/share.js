// Share cards (PNG drawn in the browser) and embed snippets.
import { useEffect, useRef, useState } from 'preact/hooks';
import { html, Sheet, toast, Blu } from './ui.js';
import { pct } from './data.js';

const BODY = 'M38 16H82A28 28 0 0 1 110 44V58A28 28 0 0 1 82 86H52L26 106L32 85A28 28 0 0 1 10 58V44A28 28 0 0 1 38 16Z';
const CAP = 'M28 25C38 5 76 2 93 19L99 25Z';
const INK = '#152E40';
const LIME = '#CEFF52';
const CORAL = '#FF7A66';

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

/** Draw a 1200x630 card for a claim card ({claim, odds_bps, last_outcome}). */
export async function drawCard(canvas, card) {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  try {
    await Promise.all([document.fonts.load('800 56px "Bricolage Grotesque"'), document.fonts.load('600 52px "Source Serif 4"'), document.fonts.load('700 26px "JetBrains Mono"')]);
  } catch { /* fall back to system fonts */ }
  const busted = card.last_outcome === 'Balablu';
  const checked = card.last_outcome === 'Fact';
  const p = pct(card.odds_bps);

  ctx.fillStyle = busted ? '#FFE3DE' : checked ? '#F1FFD0' : '#F7F9F2';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.fillRect(28 + 8, 28 + 8, W - 56, H - 56); // hard shadow
  ctx.fillStyle = '#FFFFFF';
  rrect(ctx, 28, 28, W - 56, H - 56, 36);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  rrect(ctx, 28, 28, W - 56, H - 56, 36);
  ctx.stroke();

  // Blu + wordmark
  ctx.save();
  ctx.translate(70, 62);
  ctx.scale(1.1, 1.1);
  ctx.fillStyle = INK; ctx.strokeStyle = LIME; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  const body = new Path2D(BODY); ctx.fill(body); ctx.stroke(body);
  ctx.fillStyle = LIME; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  const cap = new Path2D(CAP); ctx.fill(cap); ctx.stroke(cap);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(44, 51, 9, 10, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(76, 53, 9, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(46, 53, 4.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(77, 54, 3.5, 0, 7); ctx.fill();
  ctx.strokeStyle = LIME; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(50, 70); ctx.quadraticCurveTo(60, 76, 72, 67); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.font = '800 54px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('BalaBlu', 210, 128);
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillStyle = '#3E5566';
  ctx.fillText(card.claim.page.toUpperCase().slice(0, 34), 214, 160);

  // claim text
  let size = 54;
  let lines = [];
  const text = `“${card.claim.text}”`;
  for (; size >= 34; size -= 4) {
    ctx.font = `600 ${size}px "Source Serif 4", Georgia, serif`;
    lines = wrap(ctx, text, W - 190);
    if (lines.length <= 4) break;
  }
  ctx.fillStyle = INK;
  const top = 250;
  lines.slice(0, 4).forEach((l, i) => {
    ctx.fillText(l, 84, top + i * (size * 1.22));
    if (busted) {
      const w = ctx.measureText(l).width;
      ctx.fillStyle = CORAL; ctx.fillRect(84, top + i * (size * 1.22) - size * 0.3, w, 6); ctx.fillStyle = INK;
    }
  });

  // verdict / odds
  const by = 470;
  if (busted || checked) {
    const label = busted ? 'GOT BALABLU’D!' : 'CHECKED: IT’S A FACT';
    ctx.font = '800 50px "Bricolage Grotesque", system-ui, sans-serif';
    const w = ctx.measureText(label).width + 56;
    ctx.save();
    ctx.translate(84, by - 14);
    ctx.rotate(-0.025);
    ctx.fillStyle = INK; rrect(ctx, 6, 6, w, 76, 18); ctx.fill();
    ctx.fillStyle = busted ? CORAL : LIME; rrect(ctx, 0, 0, w, 76, 18); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = INK; rrect(ctx, 0, 0, w, 76, 18); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillText(label, 28, 56);
    ctx.restore();
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillStyle = INK;
    ctx.fillText('Judged by 3 sealed AIs · signatures checked on NEAR', 84, by + 92);
  } else {
    ctx.fillStyle = CORAL; rrect(ctx, 84, by, W - 168, 38, 19); ctx.fill();
    ctx.fillStyle = LIME; rrect(ctx, 84, by, Math.max(40, (W - 168) * p / 100), 38, 19); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; rrect(ctx, 84, by, W - 168, 38, 19); ctx.stroke();
    ctx.font = '700 28px "JetBrains Mono", monospace';
    ctx.fillStyle = INK;
    ctx.fillText(`${p}% FACT`, 84, by + 78);
    ctx.textAlign = 'right';
    ctx.fillText(`${100 - p}% BALABLU`, W - 84, by + 78);
    ctx.textAlign = 'left';
  }
  // address, top right (kept clear of the verdict line at the bottom)
  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.fillStyle = '#3E5566';
  ctx.textAlign = 'right';
  ctx.fillText(`${location.host}/claim/${card.claim.id}`, W - 70, 128);
  ctx.textAlign = 'left';
}

export function shareText(card) {
  const p = pct(card.odds_bps);
  if (card.last_outcome === 'Balablu') return `“${card.claim.text}” just got BalaBlu’d by a jury of 3 sealed AIs, with the signatures checked on NEAR. Don’t get BalaBlu’d.`;
  if (card.last_outcome === 'Fact') return `“${card.claim.text}” checked out: a jury of 3 sealed AIs ruled it a FACT on BalaBlu.`;
  return `“${card.claim.text}” — ${p}% say FACT on BalaBlu. Is it, or is it BalaBlu?`;
}

export function ShareSheet({ card, onClose }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const url = `${location.origin}/claim/${card.claim.id}`;
  useEffect(() => { drawCard(ref.current, card).then(() => setReady(true)); }, []);
  const blob = () => new Promise((res) => ref.current.toBlob(res, 'image/png'));
  async function download() {
    const b = await blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `balablu-claim-${card.claim.id}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function nativeShare() {
    const file = new File([await blob()], `balablu-claim-${card.claim.id}.png`, { type: 'image/png' });
    try { await navigator.share({ files: [file], text: shareText(card), url }); } catch { /* cancelled */ }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { prompt('Copy this link', url); }
  }
  const canShareFile = typeof navigator.canShare === 'function' && typeof File !== 'undefined' && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  return html`<${Sheet} onClose=${onClose} label="Share card">
    <div class="stack">
      <b style="font-size:20px">Share this claim</b>
      <canvas ref=${ref} style="width:100%;height:auto;border-radius:12px;border:2px solid var(--ink);background:#fff" aria-label="Share card preview"></canvas>
      <div class="row" style="gap:8px">
        <button class="btn lime" disabled=${!ready} onClick=${download}>Download PNG</button>
        <a class="btn" target="_blank" rel="noopener" href=${`https://x.com/intent/post?text=${encodeURIComponent(shareText(card))}&url=${encodeURIComponent(url)}`}>Post on X</a>
        ${canShareFile && html`<button class="btn" onClick=${nativeShare}>Share…</button>`}
        <button class="btn" onClick=${copyLink}>Copy link</button>
      </div>
      <span class="muted" style="font-size:13px">On X: press Post, then attach the downloaded picture for the full card.</span>
    </div>
  <//>`;
}

export function EmbedSheet({ card, onClose }) {
  const o = location.origin;
  const id = card.claim.id;
  const snippets = [
    ['Badge (Markdown, for READMEs)', `[![BalaBlu odds](${o}/api/badge?id=${id})](${o}/claim/${id})`],
    ['Badge (HTML)', `<a href="${o}/claim/${id}"><img src="${o}/api/badge?id=${id}" alt="BalaBlu odds"></a>`],
    ['Live card (iframe)', `<iframe src="${o}/embed/${id}" width="380" height="230" style="border:0;border-radius:16px" title="BalaBlu claim"></iframe>`],
  ];
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch { prompt('Copy this', t); } };
  return html`<${Sheet} onClose=${onClose} label="Embed this claim">
    <div class="stack">
      <b style="font-size:20px">Put these odds on your site</b>
      <img src=${`/api/badge?id=${id}`} alt="BalaBlu odds badge" height="28" style="align-self:flex-start"/>
      ${snippets.map(([t, code]) => html`<div class="stack" style="gap:6px"><span class="kicker">${t}</span>
        <code style="display:block;white-space:pre-wrap;word-break:break-all;font:500 12px var(--mono);background:var(--paper);border:1.5px solid var(--ink);border-radius:10px;padding:10px">${code}</code>
        <button class="btn small" style="align-self:flex-start" onClick=${() => copy(code)}>Copy</button></div>`)}
      <span class="muted" style="font-size:13px">The badge updates by itself: it shows the live odds, and turns coral if the jury BalaBlu’s the claim.</span>
    </div>
  <//>`;
}
