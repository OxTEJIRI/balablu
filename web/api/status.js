// One call that tells a person, a script or an AI agent what BalaBlu is and that it is alive.
//   GET /api/status
import { view, NETWORK, CONTRACT } from '../lib/near.mjs';
import { allCards, publicClaim, cors, SITE } from '../lib/claims.mjs';

export default async function handler(req, res) {
  cors(res);
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  const repo = 'https://github.com/OxTEJIRI/balablu';
  const out = {
    name: 'BalaBlu',
    tagline: 'The encyclopedia where every fact has odds.',
    network: NETWORK,
    money: 'Testnet demo: practice points and test USDC have no real value.',
    contract: CONTRACT,
    explorer: `https://testnet.nearblocks.io/address/${CONTRACT}`,
    live_app: SITE,
    build: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
    checked_at: new Date().toISOString(),
    links: {
      whitepaper: `${SITE}/docs`,
      repo,
      judges_guide: `${repo}/blob/main/JUDGES.md`,
      attack_suite_results: `${repo}/blob/main/data/attacks/RESULTS.md`,
      odds_api: `${SITE}/api/v1/odds`,
      mcp_server: `${SITE}/api/mcp`,
      llms_txt: `${SITE}/llms.txt`,
    },
    how_to_verify: [
      'GET /api/v1/odds?q=octopus to see claims with live odds and jury verdicts',
      'Open any /audit/<id> page and press "Verify it yourself" (checks enclave signatures in the browser)',
      'Run: node scripts/verify-audit.mjs <audit id>  (re-checks hashes and signatures against the chain, no dependencies)',
    ],
  };
  try {
    const [claims, audits, cards] = await Promise.all([view('claims_count'), view('audits_count'), allCards()]);
    const checked = cards.filter((c) => c.last_outcome);
    out.live = true;
    out.counts = { claims_on_chain: claims, claims_shown: cards.length, audits_on_chain: audits, claims_checked_by_jury: checked.length, claims_busted: checked.filter((c) => c.last_outcome === 'Balablu').length };
    out.example = cards[0] ? publicClaim(cards[0]) : null;
    return res.status(200).json(out);
  } catch (e) {
    out.live = false;
    out.error = e.message;
    return res.status(200).json(out);
  }
}
