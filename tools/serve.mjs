// Tiny static file server for previewing docs/ locally:  node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs');
const port = +process.argv[2] || 5183;
const types = { '.html': 'text/html', '.json': 'application/json', '.csv': 'text/csv', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(root, path === '' ? 'index.html' : path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let body;
  try {
    body = await readFile(file);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
}).listen(port, () => console.log(`serving docs/ on http://localhost:${port}`));
