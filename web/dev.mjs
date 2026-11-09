#!/usr/bin/env node
// Local dev server, no dependencies: static files, /api/* handlers (same code
// Vercel runs), /data/* from the repo, and SPA fallback.  node web/dev.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(root, '..', 'data');
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png' };

async function file(res, path) {
  const body = await readFile(path);
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/g, '');
      const mod = await import(pathToFileURL(join(root, 'api', `${name}.js`)).href);
      let raw = '';
      for await (const chunk of req) raw += chunk;
      req.body = raw ? JSON.parse(raw) : {};
      req.query = Object.fromEntries(url.searchParams);
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      return await mod.default(req, res);
    }
    if (url.pathname.startsWith('/data/')) {
      const p = normalize(join(dataRoot, url.pathname.slice(6)));
      if (!p.startsWith(dataRoot)) throw new Error('bad path');
      return await file(res, p);
    }
    const p = normalize(join(root, url.pathname));
    if (p.startsWith(root) && (await stat(p).catch(() => null))?.isFile()) return await file(res, p);
    return await file(res, join(root, 'index.html'));
  } catch (e) {
    res.statusCode = e.code === 'ENOENT' ? 404 : 500;
    res.end(String(e.message));
  }
}).listen(PORT, () => console.log(`BalaBlu dev server on http://localhost:${PORT}`));
