#!/usr/bin/env node
// Builds BalaBlu's X (Twitter) assets as PNGs, from the same Blu logo the web app uses.
//   node brand/build.mjs            -> brand/out/*.png   (needs Google Chrome; no npm packages)
// Sizes: pfp 800x800 · cover 1500x500 · welcome post 1600x900 · infographic post 1080x1350
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const out = join(here, 'out');
mkdirSync(src, { recursive: true });
mkdirSync(out, { recursive: true });

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('Chrome or Edge not found'); process.exit(1); }

const C = { ink: '#152E40', dark: '#0E2130', navy2: '#1E3D54', lime: '#CEFF52', lime2: '#E8FFB3', coral: '#FF7A66', coral2: '#FFE3DE', aqua: '#5CE1D6', aqua2: '#D6F7F4', paper: '#F7F9F2', mute: '#9DB5C4' };

// ---- Blu, exactly as in the web app ----
const BODY = 'M38 16H82A28 28 0 0 1 110 44V58A28 28 0 0 1 82 86H52L26 106L32 85A28 28 0 0 1 10 58V44A28 28 0 0 1 38 16Z';
const CAP = 'M28 25C38 5 76 2 93 19L99 25Z';
const FACE = {
  squint: `<ellipse cx="44" cy="51" rx="9" ry="10" fill="#fff"/><circle cx="46" cy="53" r="4.5" fill="${C.ink}"/><ellipse cx="76" cy="53" rx="9" ry="5" fill="#fff"/><circle cx="77" cy="54" r="3.5" fill="${C.ink}"/><path d="M66 42L87 38" stroke="${C.lime}" stroke-width="3.5" stroke-linecap="round"/><path d="M50 70Q60 76 72 67" stroke="${C.lime}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  stars: `<polygon points="44.0,40.0 46.7,47.3 54.5,47.6 48.4,52.4 50.5,59.9 44.0,55.6 37.5,59.9 39.6,52.4 33.5,47.6 41.3,47.3" fill="${C.lime}"/><polygon points="76.0,40.0 78.7,47.3 86.5,47.6 80.4,52.4 82.5,59.9 76.0,55.6 69.5,59.9 71.6,52.4 65.5,47.6 73.3,47.3" fill="${C.lime}"/><path d="M47 66Q60 80 74 66Z" fill="#fff" stroke="${C.lime}" stroke-width="3" stroke-linejoin="round"/>`,
  raspberry: `<path d="M37 45L49 51L37 57M83 45L71 51L83 57" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M54 68Q54 84 61 84Q68 84 68 68Z" fill="${C.coral}"/><path d="M46 68H76" stroke="${C.lime}" stroke-width="3.5" stroke-linecap="round"/>`,
  magnifier: `<ellipse cx="44" cy="51" rx="8" ry="9" fill="#fff"/><circle cx="46" cy="52" r="4" fill="${C.ink}"/><circle cx="78" cy="52" r="15" fill="${C.aqua}" fill-opacity="0.35" stroke="${C.aqua}" stroke-width="4"/><circle cx="78" cy="52" r="8" fill="#fff"/><circle cx="79" cy="53" r="5" fill="${C.ink}"/><path d="M89 63L104 79" stroke="${C.aqua}" stroke-width="6" stroke-linecap="round"/><circle cx="56" cy="72" r="4" fill="${C.lime}"/>`,
};
const blu = (size, face = 'squint', body = C.ink) => `<svg width="${size}" height="${Math.round(size * 0.933)}" viewBox="0 0 120 112" xmlns="http://www.w3.org/2000/svg"><path d="${BODY}" fill="${body}" stroke="${C.lime}" stroke-width="4" stroke-linejoin="round"/><path d="${CAP}" fill="${C.lime}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>${FACE[face]}</svg>`;

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@500;700&display=swap');`;
const base = (w, h, bg, css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:${bg};font-family:'Bricolage Grotesque',system-ui,sans-serif;color:#fff;position:relative}
.mono{font-family:'JetBrains Mono',monospace}.serif{font-family:'Source Serif 4',Georgia,serif}
${css}</style></head><body>${body}</body></html>`;

// ---------- 1. profile picture (800x800): dark square, lime ring, the logo on a light disc ----------
const pfp = base(800, 800, C.dark, `
.ring{position:absolute;left:30px;top:30px;width:740px;height:740px;border-radius:50%;border:30px solid ${C.lime};background:${C.paper};display:grid;place-items:center}
.ring svg{margin-top:24px}`, `<div class="ring">${blu(530)}</div>`);

// ---------- 2. cover (1500x500): mascot + "Hello BalaBlu Fam" ----------
const cover = base(1500, 500, C.dark, `
.row{position:absolute;left:0;right:0;top:108px;display:flex;justify-content:center;align-items:center;gap:44px}
.badge{width:228px;height:228px;border-radius:50%;border:12px solid ${C.lime};background:${C.paper};display:grid;place-items:center;flex:none}
.badge svg{margin-top:14px}
h1{font-weight:800;font-size:112px;letter-spacing:-4px;line-height:1}
h1 b{color:${C.lime}}
.sub{position:absolute;left:0;right:0;top:334px;text-align:center;font:500 28px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:.5px}
.sub i{font-style:normal;color:${C.coral}}`,
`<div class="row"><div class="badge">${blu(150)}</div><h1>Hello <b>BalaBlu</b> Fam</h1></div>
 <div class="sub">every fact has odds · don't get <i>BalaBlu'd</i></div>`);

// ---------- 3. welcome post image (1600x900) ----------
const welcome = base(1600, 900, C.ink, `
.glow{position:absolute;right:-120px;top:-60px;width:900px;height:900px;border-radius:50%;background:radial-gradient(closest-side,rgba(206,255,82,.20),rgba(206,255,82,0))}
.top{position:absolute;left:90px;top:70px;display:flex;align-items:center;gap:16px;font-weight:800;font-size:40px;letter-spacing:-1px}
.chip{position:absolute;left:90px;top:200px;font:700 25px 'JetBrains Mono',monospace;letter-spacing:1px;padding:12px 20px;border-radius:12px;background:${C.lime};color:${C.ink}}
h1{position:absolute;left:90px;top:262px;font-weight:800;font-size:132px;line-height:1.0;letter-spacing:-5px;width:940px}
h1 b{color:${C.ink};background:${C.lime};padding:0 20px;border-radius:24px;margin-left:-6px}
.sub{position:absolute;left:94px;top:570px;font:400 40px/1.35 'Source Serif 4',serif;color:#C9D6DF;width:860px}
.btns{position:absolute;left:94px;top:715px;display:flex;gap:22px}
.btn{height:92px;padding:0 44px;border-radius:24px;border:5px solid ${C.dark};box-shadow:0 8px 0 ${C.dark};font-weight:800;font-size:40px;color:${C.ink};display:flex;align-items:center}
.f{background:${C.lime}}.b{background:${C.coral}}
.blu{position:absolute;right:96px;top:210px}
.tag{position:absolute;font:700 30px 'JetBrains Mono',monospace;padding:12px 22px;border-radius:16px;border:5px solid ${C.dark};box-shadow:0 6px 0 ${C.dark};color:${C.ink}}
.t1{right:96px;top:122px;background:${C.lime};transform:rotate(5deg)}
.t2{right:120px;top:640px;background:${C.coral};transform:rotate(-6deg)}
.url{position:absolute;right:90px;bottom:62px;font:700 30px 'JetBrains Mono',monospace;color:${C.lime}}
.near{position:absolute;right:90px;bottom:108px;font:500 24px 'JetBrains Mono',monospace;color:${C.mute}}`,
`<div class="glow"></div>
 <div class="top">${blu(64, 'squint', C.navy2)}BalaBlu</div>
 <div class="chip">NOW LIVE · TESTNET DEMO</div>
 <h1>Hello, world.<br>Meet <b>Blu.</b></h1>
 <div class="sub">The encyclopedia where every fact has odds. Spot nonsense? Call it.</div>
 <div class="btns"><div class="btn f">FACT</div><div class="btn b">BALABLU</div></div>
 <div class="blu">${blu(470, 'squint', C.navy2)}</div>
 <div class="tag t1">84% FACT</div><div class="tag t2">BALABLU'D!</div>
 <div class="near">Built at NEAR HACKATHON</div><div class="url">balabluapp.vercel.app</div>`);

// ---------- 4. infographic post image (1080x1350) ----------
const step = (n, color, title, text, tag) => `<div class="step"><div class="num" style="background:${color}">${n}</div><div class="st"><b>${title}</b><span>${text}</span></div><div class="stag">${tag}</div></div>`;
const info = base(1080, 1350, C.paper, `
body{color:${C.ink}}
.head{position:absolute;left:64px;right:64px;top:50px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px;font-weight:800;font-size:38px;letter-spacing:-1px}
.pill{font:700 21px 'JetBrains Mono',monospace;letter-spacing:1px;background:${C.ink};color:${C.lime};padding:10px 18px;border-radius:12px}
h1{position:absolute;left:64px;right:64px;top:128px;font-weight:800;font-size:84px;line-height:1.02;letter-spacing:-3px}
h1 b{background:${C.lime};padding:0 14px;border-radius:16px}
.lead{position:absolute;left:66px;right:64px;top:246px;font:400 30px/1.4 'Source Serif 4',serif;color:#2B4253}
.steps{position:absolute;left:64px;right:64px;top:324px;display:flex;flex-direction:column;gap:20px}
.step{position:relative;display:flex;gap:26px;align-items:center;background:#fff;border:4px solid ${C.ink};border-radius:26px;padding:18px 24px;box-shadow:7px 7px 0 ${C.ink}}
.num{flex:none;width:70px;height:70px;border-radius:20px;border:4px solid ${C.ink};display:grid;place-items:center;font-weight:800;font-size:46px}
.st{display:flex;flex-direction:column;gap:4px;flex:1}
.st b{font-weight:800;font-size:36px;letter-spacing:-1px}
.st span{font:400 25px/1.32 'Source Serif 4',serif;color:#2B4253}
.stag{flex:none;font:700 19px 'JetBrains Mono',monospace;border:3px solid ${C.ink};border-radius:10px;padding:6px 10px;background:${C.lime2};white-space:nowrap}
.stats{position:absolute;left:64px;right:64px;top:1084px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.stat{background:${C.ink};color:#fff;border-radius:24px;padding:20px 18px;text-align:center}
.stat b{display:block;font:800 60px 'Bricolage Grotesque',sans-serif;color:${C.lime};letter-spacing:-2px;line-height:1}
.stat span{font:500 21px/1.25 'JetBrains Mono',monospace;color:#C9D6DF;display:block;margin-top:8px}
.foot{position:absolute;left:64px;right:64px;bottom:34px;display:flex;justify-content:space-between;align-items:center;font:700 24px 'JetBrains Mono',monospace}
.foot i{font-style:normal;color:#3E5566;font-weight:500;font-size:20px}`,
`<div class="head"><div class="brand">${blu(58)}BalaBlu</div><div class="pill">HOW IT WORKS</div></div>
 <h1>Who decides what's <b>true?</b></h1>
 <div class="lead">Nobody has to trust us. Here is how one claim gets settled.</div>
 <div class="steps">
  ${step(1, C.lime, 'You call it', 'Tap a sentence and press FACT or BALABLU. Free practice points, no wallet.', 'ODDS MOVE')}
  ${step(2, C.aqua, 'The jury meets', 'At a surprise time, 3 AI models in sealed chips read the evidence and vote.', '3 AIs')}
  ${step(3, C.coral2, 'Every vote is signed', 'Each sealed chip signs its answer, so nobody can edit it, not even us.', 'SIGNED')}
  ${step(4, C.lime, 'NEAR checks the signatures', 'The smart contract refuses anything that was changed, then pays the winners.', 'ON-CHAIN')}
 </div>
 <div class="stats"><div class="stat"><b>3</b><span>sealed AI jurors</span></div><div class="stat"><b>54/54</b><span>attack checks passed</span></div><div class="stat"><b>0</b><span>owner backdoors</span></div></div>
 <div class="foot"><span>balabluapp.vercel.app/docs</span><i>testnet demo · play money</i></div>`);

const jobs = [
  ['pfp', pfp, 800, 800],
  ['cover', cover, 1500, 500],
  ['welcome-post', welcome, 1600, 900],
  ['infographic-post', info, 1080, 1350],
];
for (const [name, html, w, h] of jobs) {
  const file = join(src, `${name}.html`);
  writeFileSync(file, html);
  const png = join(out, `${name}.png`);
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=15000', `--screenshot=${png}`, pathToFileURL(resolve(file)).href], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(png)) { console.error(`failed: ${name}`, r.stderr?.slice(-300)); continue; }
  console.log(`✓ ${name}.png`);
}
