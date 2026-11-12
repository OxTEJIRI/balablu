// BalaBlu as an MCP server (Streamable HTTP, JSON-RPC 2.0, stateless).
// Add it to any MCP client with the URL https://balabluapp.vercel.app/api/mcp
// Tools: check_claim, get_claim, list_claims. An agent can ask "is this true?"
// and get live odds plus the verdict of the sealed-AI jury, before it answers.
import { allCards, rank, publicClaim, cors, SITE } from '../lib/claims.mjs';

const TOOLS = [
  {
    name: 'check_claim',
    description: 'Look up a factual statement or question on BalaBlu. Returns the best-matching claims with live odds that they are TRUE, and the jury verdict (three sealed NEAR AI models, signatures verified on NEAR) when one exists. Use this before stating a contested fact.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'The statement or question, e.g. "Can you see the Great Wall from the Moon?"' }, limit: { type: 'number', description: 'Max results (default 3)' } }, required: ['query'] },
  },
  {
    name: 'get_claim',
    description: 'Get one BalaBlu claim by id, with its rule, sources, odds, jury verdict and audit link.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
  },
  {
    name: 'list_claims',
    description: 'List every claim on BalaBlu with odds and verdicts. Optionally only claims the jury has checked.',
    inputSchema: { type: 'object', properties: { only_checked: { type: 'boolean' } } },
  },
];

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });

async function callTool(name, args = {}) {
  const cards = await allCards();
  if (name === 'check_claim') {
    const hits = rank(cards, String(args.query || '').slice(0, 300), Math.min(Number(args.limit) || 3, 10));
    if (!hits.length) return text({ found: false, message: 'No claim on BalaBlu matches yet. A person can put it up for betting at ' + SITE + '/ask', query: args.query });
    return text({ found: true, query: args.query, claims: hits.map(publicClaim) });
  }
  if (name === 'get_claim') {
    const c = cards.find((x) => x.claim.id === Number(args.id));
    return c ? text(publicClaim(c)) : { ...text('No such claim.'), isError: true };
  }
  if (name === 'list_claims') {
    const list = args.only_checked ? cards.filter((c) => c.last_outcome) : cards;
    return text({ count: list.length, claims: list.map(publicClaim) });
  }
  return { ...text(`Unknown tool: ${name}`), isError: true };
}

async function handle(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize') {
    return ok({ protocolVersion: params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'balablu', version: '1.0.0' }, instructions: 'BalaBlu is an encyclopedia where every fact has odds. Use check_claim to see how sure people are that something is true, and whether a jury of sealed AIs has settled it.' });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try { return ok(await callTool(params?.name, params?.arguments)); } catch (e) { return ok({ ...text(`BalaBlu error: ${e.message}`), isError: true }); }
  }
  if (id === undefined) return null; // notifications need no reply
  return err(-32601, `Method not found: ${method}`);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({ name: 'balablu', description: 'BalaBlu MCP server (Streamable HTTP). POST JSON-RPC here.', tools: TOOLS.map((t) => t.name), docs: `${SITE}/docs#agents` });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handle))).filter(Boolean);
      return out.length ? res.status(200).json(out) : res.status(202).end();
    }
    const out = await handle(body || {});
    return out ? res.status(200).json(out) : res.status(202).end();
  } catch (e) {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } });
  }
}
