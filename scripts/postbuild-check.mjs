import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const maxBytes = 25 * 1024 * 1024;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const failures = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

if (!existsSync(distDir)) {
  console.error('postbuild-check: dist/ directory does not exist.');
  process.exit(1);
}

for (const required of ['_headers', '_redirects', 'robots.txt', 'sitemap.xml']) {
  if (!existsSync(resolve(distDir, required))) {
    failures.push(`Missing required file in dist/: ${required}`);
  }
}

const headersPath = resolve(distDir, '_headers');
if (existsSync(headersPath)) {
  const headersRaw = readFileSync(headersPath, 'utf8');
  const sections = new Map();
  let currentPath = null;
  for (const line of headersRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      currentPath = trimmed;
      if (!sections.has(currentPath)) sections.set(currentPath, []);
    } else if (currentPath) {
      sections.get(currentPath).push(trimmed);
    }
  }

  const wildcardHeaders = sections.get('/*') || [];
  if (wildcardHeaders.some((h) => h.toLowerCase().startsWith('content-security-policy:'))) {
    failures.push('CSP must not be set on /* in _headers (Cloudflare merges policies).');
  }
  for (const pathKey of ['/', '/app/*']) {
    const list = sections.get(pathKey) || [];
    if (!list.some((h) => h.toLowerCase().startsWith('content-security-policy:'))) {
      failures.push(`Missing Content-Security-Policy on ${pathKey} in _headers.`);
    }
  }
}

const textExts = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg']);
const files = walk(distDir);

for (const file of files) {
  const rel = relative(distDir, file);
  const size = statSync(file).size;

  if (file.endsWith('.map')) {
    failures.push(`Source map found in dist/: ${rel}`);
  }
  if (size > maxBytes) {
    failures.push(`File exceeds 25 MiB (${size} bytes): ${rel}`);
  }

  const ext = extname(file).toLowerCase();
  if (!textExts.has(ext)) continue;

  const content = readFileSync(file, 'utf8');

  if (ext === '.html') {
    const inlineScriptMatch = content.match(/<script(?![^>]*\bsrc=)[^>]*>/i);
    if (inlineScriptMatch) {
      failures.push(`Inline <script> without src found in ${rel}`);
    }
  }

  if (content.includes('service_role')) {
    failures.push(`Secret pattern "service_role" found in ${rel}`);
  }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) {
    failures.push(`Private key header found in ${rel}`);
  }
  if (/\bsk-[A-Za-z0-9_-]{16,}\b/.test(content)) {
    failures.push(`Secret key pattern "sk-..." found in ${rel}`);
  }

  const jwtMatches = content.match(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g);
  if (jwtMatches) {
    for (const token of jwtMatches) {
      if (!anonKey || token !== anonKey) {
        failures.push(`Unexpected JWT ("eyJ...") found in ${rel}`);
        break;
      }
    }
  }
}

if (failures.length > 0) {
  console.error('postbuild-check failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`postbuild-check passed (${files.length} files scanned).`);
