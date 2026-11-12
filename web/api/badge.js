// Live odds badge: an SVG you can embed anywhere.
//   <img src="https://balabluapp.vercel.app/api/badge?id=3" alt="BalaBlu odds">
import { allCards, cors } from '../lib/claims.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  cors(res);
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  let label = 'BalaBlu';
  let value = 'claim not found';
  let bg = '#DCE3D6';
  let fg = '#152E40';
  try {
    const c = (await allCards()).find((x) => String(x.claim.id) === String(q.id));
    if (c) {
      const p = Math.round(c.odds_bps / 100);
      if (c.last_outcome === 'Balablu') { value = "BalaBlu'd by the AI jury"; bg = '#FF7A66'; }
      else if (c.last_outcome === 'Fact') { value = 'checked: FACT'; bg = '#CEFF52'; }
      else { value = `${p}% say FACT`; bg = p >= 65 ? '#CEFF52' : p >= 40 ? '#E8FFB3' : '#FFE3DE'; }
    }
  } catch { /* show the not-found badge */ }
  const w1 = 78;
  const w2 = Math.max(110, value.length * 7.6 + 22);
  const w = w1 + w2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" viewBox="0 0 ${w} 28" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<rect x="1" y="1" width="${w - 2}" height="26" rx="13" fill="#fff" stroke="#152E40" stroke-width="2"/>
<path d="M14 1H${w1}V27H14A13 13 0 0 1 14 1Z" fill="#152E40"/>
<text x="${w1 / 2 + 3}" y="18.5" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="12" font-weight="700" fill="#CEFF52">${esc(label)}</text>
<path d="M${w1} 1H${w - 14}A13 13 0 0 1 ${w - 14} 27H${w1}Z" fill="${bg}"/>
<text x="${w1 + w2 / 2}" y="18.5" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="12" font-weight="700" fill="${fg}">${esc(value)}</text>
</svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).end(svg);
}
