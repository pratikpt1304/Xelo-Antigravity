import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function parseHeadersFile() {
  const file = resolve(distDir, '_headers');
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const rules = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      current = { pattern: trimmed, headers: {} };
      rules.push(current);
    } else if (current) {
      const idx = trimmed.indexOf(':');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        current.headers[key] = val;
      }
    }
  }
  return rules;
}

function matchPattern(pattern, pathname) {
  if (pattern === '/*') return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return pathname.startsWith(prefix);
  }
  return pathname === pattern;
}

const headerRules = parseHeadersFile();

const server = createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  let filePath = join(distDir, urlPath === '/' ? 'index.html' : urlPath);

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  let status = 200;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (urlPath.startsWith('/app')) {
      filePath = join(distDir, 'app/index.html');
    } else {
      status = 404;
    }
  }

  for (const rule of headerRules) {
    if (matchPattern(rule.pattern, urlPath)) {
      for (const [k, v] of Object.entries(rule.headers)) {
        res.setHeader(k, v);
      }
    }
  }

  if (status === 404) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Static test server listening on http://127.0.0.1:${port}`);
});
