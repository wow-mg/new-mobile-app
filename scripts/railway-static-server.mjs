#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const rootArg = process.argv[2] ?? 'apps/mobile/dist';
const root = resolve(process.cwd(), rootArg);
const port = Number(process.env.PORT ?? 3000);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const normalized = normalize(decoded).replace(/^([/\\])+/, '');
  const candidate = resolve(root, normalized);
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null;
}

function sendFile(res, filePath) {
  const type = contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

if (!existsSync(root)) {
  console.error(`Static root not found: ${root}`);
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  const candidate = safePath(req.url ?? '/');
  let filePath = candidate;
  if (!filePath) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = join(root, 'index.html');

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-type': contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream' });
    res.end();
    return;
  }

  sendFile(res, filePath);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${rootArg} on port ${port}`);
});
