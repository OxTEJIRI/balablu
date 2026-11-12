import { useState, useEffect } from 'preact/hooks';
import { html, Blu, Loading } from '../ui.js';
import { REPO } from '../config.js';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(html`<b>${inline(m[1])}</b>`);
    else if (m[2]) out.push(html`<em>${inline(m[2])}</em>`);
    else if (m[3]) out.push(html`<code>${m[3]}</code>`);
    else {
      const ext = /^https?:/.test(m[5]);
      out.push(html`<a href=${m[5]} target=${ext ? '_blank' : null} rel=${ext ? 'noopener noreferrer' : null}>${m[4]}</a>`);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Headings, paragraphs, lists, tables, quotes, code. Returns { toc, body }. */
export function renderMarkdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const body = [];
  const toc = [];
  let i = 0;
  const isTable = (l) => /^\s*\|.*\|\s*$/.test(l || '');
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      const id = slugify(h[2]);
      if (level === 1) body.push(html`<h1 id=${id} class="doc-title">${inline(h[2])}</h1>`);
      else {
        toc.push({ level, title: h[2], id });
        body.push(level === 2 ? html`<h2 id=${id}>${inline(h[2])}</h2>` : html`<h3 id=${id}>${inline(h[2])}</h3>`);
      }
      i++; continue;
    }
    if (line.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      body.push(html`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }
    if (line.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      body.push(html`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    if (isTable(line) && isTable(lines[i + 1]) && /^[\s|:-]+$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTable(lines[i])) rows.push(cells(lines[i++]));
      body.push(html`<div class="table-wrap"><table><thead><tr>${head.map((c) => html`<th>${inline(c)}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${inline(c)}</td>`)}</tr>`)}</tbody></table></div>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const li = items.map((t) => html`<li>${inline(t)}</li>`);
      body.push(ordered ? html`<ol>${li}</ol>` : html`<ul>${li}</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|```|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i]) && !isTable(lines[i])) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    body.push(html`<p>${inline(para.join(' '))}</p>`);
  }
  return { toc, body };
}

export function Docs() {
  const [md, setMd] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/content/whitepaper.md').then((r) => (r.ok ? r.text() : Promise.reject())).then(setMd).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (md && location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 50);
  }, [md]);
  if (failed) return html`<div class="wrap"><p>Could not load the whitepaper. <a href=${`${REPO}/blob/main/web/content/whitepaper.md`}>Read it on GitHub</a>.</p></div>`;
  if (!md) return html`<div class="wrap"><${Loading} text="Opening the whitepaper…"/></div>`;
  const { toc, body } = renderMarkdown(md);
  return html`<div class="wrap docs" style="padding-top:28px">
    <div class="row" style="gap:28px;align-items:flex-start;flex-wrap:wrap">
      <nav class="toc" aria-label="Contents" style="flex:0 1 230px;min-width:200px;position:sticky;top:96px;max-height:calc(100vh - 120px);overflow:auto">
        <div class="row" style="margin-bottom:10px"><${Blu} face="magnifier" size=${40}/><b style="font-size:18px">Docs</b></div>
        ${toc.filter((t) => t.level === 2).map((t) => html`<a href=${'#' + t.id} onClick=${(e) => { e.preventDefault(); history.replaceState(null, '', '#' + t.id); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); }}>${t.title}</a>`)}
        <div class="legend" style="margin-top:16px;font-size:13px">Short on time? Read <a href="#summary">Summary</a>, then <a href="#roadmap-and-future-plans">Roadmap</a>.</div>
      </nav>
      <article class="doc" style="flex:999 1 560px;min-width:0">${body}</article>
    </div>
  </div>`;
}
