import { useState, useEffect } from 'preact/hooks';
import { html, Blu, Loading, toast, useEvent, fmt } from '../ui.js';
import { view, friendly } from '../data.js';
import { USDC, CONTRACT, NETWORK } from '../config.js';
import * as wallet from '../wallet.js';

export function Wallet() {
  const [acct, setAcct] = useState(wallet.account());
  const [w, setW] = useState(null);
  const [busy, setBusy] = useState(false);
  useEvent('wallet', (a) => setAcct(a));
  const load = () => acct && view('get_wallet', { account_id: acct }).then(setW);
  useEffect(() => { load(); }, [acct]);

  async function run(label, fn) {
    setBusy(true);
    try { await fn(); toast(label); load(); } catch (e) { toast(friendly(e.message), true); } finally { setBusy(false); }
  }
  const getTestUsdc = () => run('10 test USDC added to your BalaBlu wallet!', () => wallet.callMany([
    { receiver: USDC, method: 'mint', args: { account_id: acct, amount: '10000000' }, gas: '30000000000000' },
    { receiver: USDC, method: 'ft_transfer_call', args: { receiver_id: CONTRACT, amount: '10000000', msg: '' }, deposit: '1', gas: '100000000000000' },
  ]));
  const withdraw = () => run('Sent back to your NEAR wallet.', () => wallet.call('withdraw_usdc', { amount: w.usdc }, { deposit: '1' }));

  return html`<div class="wrap stack" style="max-width:820px;padding-top:28px;gap:22px">
    <div class="row"><${Blu} face="squint" size=${56}/><div><h1 class="h2">Money</h1><span class="muted">Practice is free. Real money is optional, capped at $2 a bet.</span></div></div>
    ${!acct ? html`<div class="card pop stack" style="gap:14px">
        <b style="font-size:20px">Connect a NEAR wallet to play with real money</b>
        <span class="muted">Meteor or MyNearWallet. You approve each money move in your wallet; BalaBlu never holds your keys.</span>
        <button class="btn lime big" onClick=${() => wallet.signIn().catch((e) => toast(e.message, true))}>Connect wallet</button>
      </div>`
    : html`<div class="card pop stack" style="gap:14px">
        <div class="row" style="justify-content:space-between"><span class="kicker">Connected</span><button class="btn small" onClick=${() => wallet.signOut()}>Disconnect</button></div>
        <b class="mono" style="font-size:18px">${acct}</b>
        ${!w ? html`<${Loading} text="Loading your balance…"/>` : html`<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div class="card"><div class="mono" style="font-size:28px;font-weight:700">$${fmt(w.usdc)}</div><span class="muted">USDC in BalaBlu</span></div>
          <div class="card"><div class="mono" style="font-size:28px;font-weight:700">${fmt(w.points, 0)}</div><span class="muted">practice points</span></div>
        </div>`}
        <div class="row">
          ${NETWORK === 'testnet' && html`<button class="btn lime" disabled=${busy} onClick=${getTestUsdc}>Get 10 test USDC</button>`}
          <button class="btn" disabled=${busy || !w || w.usdc === '0'} onClick=${withdraw}>Cash out all</button>
        </div>
        ${NETWORK === 'testnet' && html`<span class="muted" style="font-size:13px">On testnet the USDC is free play money from our test token (mint + deposit in one wallet approval).</span>`}
      </div>`}
    <${AnyCoin} acct=${acct}/>
  </div>`;
}

/** About $5 worth of a coin, rounded to 2 significant digits ("0.067" BTC-ish, "5" USDC). */
const startAmount = (t) => String(Number((5 / (t.price || 1)).toPrecision(2)));

function AnyCoin({ acct }) {
  const [tokens, setTokens] = useState([]);
  const [from, setFrom] = useState(null);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState(null);
  const pick = (t) => { setFrom(t.assetId); setAmount(startAmount(t)); };
  useEffect(() => {
    fetch('/api/quote').then((r) => r.json()).then((j) => {
      const want = [['SOL', 'sol'], ['ETH', 'eth'], ['BTC', 'btc'], ['USDC', 'base'], ['USDC', 'sol']];
      const list = want.map(([s, ch]) => j.tokens.find((t) => t.symbol === s && t.chain === ch) || j.tokens.find((t) => t.symbol === s)).filter(Boolean);
      setTokens(list);
      if (list[0]) pick(list[0]);
    }).catch(() => setErr('Could not reach NEAR Intents right now.'));
  }, []);
  /** "try at least 150000" is in the coin's smallest unit: say it in plain money. */
  const nice = (msg, t) => {
    const m = /at least (\d+)/i.exec(msg || '');
    if (m && t) {
      const v = Number(m[1]) / 10 ** t.decimals;
      return `That’s too small to swap. Try at least ${Number(v.toPrecision(2))} ${t.symbol} (about $${(v * t.price).toFixed(2)}).`;
    }
    return msg;
  };
  useEffect(() => {
    if (!from || !amount) return;
    setQuote(null);
    setErr(null);
    const t = setTimeout(() => {
      fetch(`/api/quote?from=${encodeURIComponent(from)}&amount=${encodeURIComponent(amount)}`).then((r) => r.json()).then((j) => {
        if (j.quote) setQuote(j.quote); else setErr(j.message || j.error || 'no quote');
      }).catch(() => setErr('no quote'));
    }, 400);
    return () => clearTimeout(t);
  }, [from, amount]);
  const tok = tokens.find((t) => t.assetId === from);
  return html`<div class="card stack" style="gap:14px">
    <b style="font-size:20px">Pay with any coin</b>
    <span class="muted">Send from the wallet you already use (Solana, Ethereum, Bitcoin, Base…). NEAR Intents swaps it to USDC on NEAR, usually in under a minute (Bitcoin takes longer). No bridge, no gas coin needed.</span>
    <span class="kicker">1 · Pick your coin</span>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">
      ${tokens.map((t) => html`<button class="btn" style=${from === t.assetId ? 'background:var(--lime-2);border-width:3px' : ''} aria-pressed=${from === t.assetId} onClick=${() => pick(t)}>${t.symbol}<span class="muted" style="font-size:12px">${t.chain}</span></button>`)}
    </div>
    <span class="kicker">2 · How much</span>
    <label class="row" style="border:2px solid var(--ink);border-radius:14px;padding:0 14px;height:52px;flex-wrap:nowrap">
      <span class="sr">Amount</span>
      <input inputmode="decimal" value=${amount} onInput=${(e) => setAmount(e.target.value)} style="flex:1;border:0;outline:none;font:700 20px var(--mono);min-width:0;background:transparent"/>
      <b>${tok?.symbol || ''}</b>
    </label>
    <div class="payout">
      ${err ? html`<span>${nice(err, tok)}</span>` : !quote ? html`<span class="muted">Getting a live quote from NEAR Intents…</span>` : html`
        You send <b class="mono">${quote.amountInFormatted} ${tok?.symbol}</b> (≈ $${Number(quote.amountInUsd).toFixed(2)})<br/>
        You get <b class="mono hl">${Number(quote.amountOutFormatted).toFixed(2)} USDC</b> in about ${quote.timeEstimate > 90 ? `${Math.round(quote.timeEstimate / 60)} min` : `${quote.timeEstimate} s`}`}
    </div>
    <span class="muted" style="font-size:13px">${NETWORK === 'testnet' ? 'This is the testnet demo, so the bets use play money. The prices above are real, live quotes from NEAR Intents (it only exists on mainnet), so you can see exactly what paying with any coin will cost. Real deposits switch on in the mainnet version.' : 'Your deposit address appears after you confirm.'}</span>
  </div>`;
}
