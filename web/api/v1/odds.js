// Public odds API for AI agents and developers.
//   GET /api/v1/odds?q=<question or claim text>   -> best-matching claims with odds and jury verdicts
//   GET /api/v1/odds?id=<claim id>                -> one claim
//   GET /api/v1/odds                              -> all claims
import { allCards, rank, publicClaim, cors } from '../../lib/claims.mjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const cards = await allCards();
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    if (q.id != null) {
      const c = cards.find((x) => String(x.claim.id) === String(q.id));
      return c ? res.status(200).json(publicClaim(c)) : res.status(404).json({ error: 'no such claim' });
    }
    const list = q.q ? rank(cards, String(q.q).slice(0, 300), Math.min(Number(q.limit) || 5, 20)) : cards;
    return res.status(200).json({
      query: q.q || null,
      note: 'fact_odds_percent is how sure bettors are the claim is TRUE. jury_verdict is set only after three sealed AI models (NEAR AI) voted and the NEAR contract verified their signatures.',
      count: list.length,
      claims: list.map(publicClaim),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
