// Minimal Markdown for AI-written pages, with live claim highlights:
// a sentence followed by [#id] becomes a tappable claim coloured by its odds.
import { html, hlColor } from './ui.js';
import { pct } from './data.js';

function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] ? html`<b>${m[1]}</b>` : html`<em>${m[2]}</em>`);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function paragraph(text, cards, onClaim) {
  const out = [];
  const re = /((?:\s*\[#\d+\])+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(last, m.index);
    const ids = [...m[1].matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
    const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
    const plain = cut >= 0 ? before.slice(0, cut + 2) : '';
    const sentence = cut >= 0 ? before.slice(cut + 2) : before;
    if (plain) out.push(...inline(plain));
    const card = cards.get(ids[0]);
    if (card) {
      const busted = card.last_outcome === 'Balablu';
      out.push(html`<span class=${'claimtext' + (busted ? ' busted' : '')} style=${busted ? '' : `background:${hlColor(card.odds_bps)}`}
        role="button" tabindex="0" title="Tap to call it"
        onClick=${() => onClaim(card)} onKeyDown=${(e) => e.key === 'Enter' && onClaim(card)}>${inline(sentence.trim())}</span>`);
      out.push(busted
        ? html` <span class="tag" style="background:var(--coral);vertical-align:2px">BALABLU’D</span> `
        : card.last_outcome === 'Fact'
          ? html` <span class="tag" style="background:var(--lime);vertical-align:2px" title="Checked by the AI jury">✓ CHECKED</span> `
          : html`<sup class="odds-sup">${pct(card.odds_bps)}%</sup> `);
    } else {
      out.push(...inline(sentence));
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(...inline(text.slice(last)));
  return out;
}

/** Returns { sections: [{title, id}], body: vnodes } */
export function renderPage(md, cards, onClaim) {
  const lines = md.replace(/\r/g, '').split('\n');
  const body = [];
  const sections = [];
  let para = [];
  const flush = () => {
    if (para.length) body.push(html`<p>${paragraph(para.join(' '), cards, onClaim)}</p>`);
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#\s/.test(line)) { flush(); continue; }
    const hm = line.match(/^#{2,3}\s+(.*)/);
    if (hm) {
      flush();
      const id = 's-' + hm[1].toLowerCase().replace(/[^a-z0-9]+/g, '-');
      sections.push({ title: hm[1], id });
      body.push(html`<h2 id=${id}>${hm[1]}</h2>`);
      continue;
    }
    if (!line) { flush(); continue; }
    if (/^[-*]\s+/.test(line)) { flush(); para.push(line.replace(/^[-*]\s+/, '')); flush(); continue; }
    para.push(line);
  }
  flush();
  return { sections, body };
}
