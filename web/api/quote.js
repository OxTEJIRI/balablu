// NEAR Intents 1Click quote (dry by default): "send X of any coin, get Y USDC on NEAR".
const ONE_CLICK = 'https://1click.chaindefuser.com/v0';
const USDC_NEAR = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

let tokens = { at: 0, list: [] };

// A dry quote only prices a swap and moves no money, but 1Click still wants a
// well-formed refund address for the coin's chain. Placeholders, never funded.
const PLACEHOLDER = {
  sol: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  eth: '0x1111111111111111111111111111111111111111',
  base: '0x1111111111111111111111111111111111111111',
  arb: '0x1111111111111111111111111111111111111111',
  btc: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  near: 'near',
};
// Intents rejects quotes to a recipient account that does not exist. Until the
// mainnet app account is created, price dry quotes against the NEAR system account.
const QUOTE_RECIPIENT = process.env.QUOTE_RECIPIENT || 'near';

export default async function handler(req, res) {
  try {
    if (Date.now() - tokens.at > 10 * 60_000) {
      const r = await fetch(`${ONE_CLICK}/tokens`);
      tokens = { at: Date.now(), list: await r.json() };
    }
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (!q.from) {
      const pick = ['SOL', 'ETH', 'BTC', 'USDC'];
      const list = tokens.list.filter((t) => pick.includes(t.symbol) && ['sol', 'eth', 'btc', 'base', 'arb'].includes(t.blockchain)).map((t) => ({ assetId: t.assetId, symbol: t.symbol, chain: t.blockchain, decimals: t.decimals, price: t.price }));
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
      refundTo: String(q.refundTo || PLACEHOLDER[t.blockchain] || PLACEHOLDER[t.chain] || PLACEHOLDER.eth),
      refundType: 'ORIGIN_CHAIN',
      recipient: QUOTE_RECIPIENT,
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
