// NEAR Intents 1Click quote (dry by default): "send X of any coin, get Y USDC on NEAR".
const ONE_CLICK = 'https://1click.chaindefuser.com/v0';
const USDC_NEAR = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

let tokens = { at: 0, list: [] };

export default async function handler(req, res) {
  try {
    if (Date.now() - tokens.at > 10 * 60_000) {
      const r = await fetch(`${ONE_CLICK}/tokens`);
      tokens = { at: Date.now(), list: await r.json() };
    }
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (!q.from) {
      const pick = ['SOL', 'ETH', 'BTC', 'USDC', 'NEAR', 'USDT'];
      const list = tokens.list.filter((t) => pick.includes(t.symbol)).map((t) => ({ assetId: t.assetId, symbol: t.symbol, chain: t.blockchain, decimals: t.decimals, price: t.price }));
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json({ tokens: list });
    }
    const t = tokens.list.find((x) => x.assetId === q.from);
    if (!t) return res.status(400).json({ error: 'unknown coin' });
    const amount = BigInt(Math.round(Number(q.amount || '0') * 10 ** Math.min(t.decimals, 12))) * 10n ** BigInt(Math.max(0, t.decimals - 12));
    if (amount <= 0n) return res.status(400).json({ error: 'enter an amount' });
    const body = {
      dry: true,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: t.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: USDC_NEAR,
      amount: amount.toString(),
      refundTo: String(q.refundTo || ''),
      refundType: 'ORIGIN_CHAIN',
      recipient: String(q.recipient || 'balabluapp.near'),
      recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
    const r = await fetch(`${ONE_CLICK}/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    return res.status(r.ok ? 200 : 400).json(j);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
