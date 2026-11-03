#!/usr/bin/env node
// Generate the "redirects" block of vercel.json from content/redirects/*.csv.
//
//   node scripts/build-redirects.mjs          # rewrite vercel.json
//   node scripts/build-redirects.mjs --check  # exit 1 if vercel.json is out of date
//
// CSV columns: from,to,kind  (# lines are comments). kind=redirect rows are emitted in file
// order (first match wins); kind=keep rows document legacy URLs whose page still exists and
// are only verified by check-redirects.mjs.
//
// Why sources are rewritten: vercel.json sets trailingSlash:true, and Vercel applies that
// 308 BEFORE user redirects, matching redirect sources strictly. A request for /post/foo is
// first sent to /post/foo/, so a source of "/post/foo" never matches. Every extensionless
// source is therefore emitted with a trailing slash; file paths (sitemap.xml) are left as-is
// because the trailing-slash rule skips paths with an extension.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'content/redirects');
const CONFIG = join(ROOT, 'vercel.json');

const hasExt = (p) => /\.[a-z0-9]+$/i.test(p.split('/').pop());
const isPattern = (p) => /[:*(]/.test(p);
const pageExists = (p) => (hasExt(p) ? existsSync(join(ROOT, p)) : existsSync(join(ROOT, p, 'index.html')));

export function loadRows() {
  const rows = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.csv')).sort()) {
    const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
    let header = null;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const cells = t.split(',').map((c) => c.trim());
      if (!header) { header = cells; return; }
      const row = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']));
      rows.push({ ...row, where: `${file}:${i + 1}` });
    });
  }
  return rows;
}

function validate(rows) {
  const errors = [];
  const froms = new Set();
  const redirectFroms = new Set(rows.filter((r) => r.kind === 'redirect').map((r) => r.from.replace(/\/$/, '')));
  for (const r of rows) {
    const bad = (msg) => errors.push(`${r.where}: ${r.from} → ${r.to}: ${msg}`);
    if (!['redirect', 'keep'].includes(r.kind)) bad(`unknown kind "${r.kind}"`);
    if (!/^\/[a-z0-9._\-\/:*]*$/i.test(r.from)) bad('"from" must be a site path of [a-z0-9._-/] (and :param for patterns)');
    if (!r.to.startsWith('/')) bad('"to" must be a site path');
    const key = r.from.replace(/\/$/, '') || '/';
    if (froms.has(key)) bad('duplicate "from"');
    froms.add(key);
    // The landing page must exist, or the redirect just moves the 404 somewhere else.
    if (!pageExists(r.to.replace(/^\//, ''))) bad('"to" is not a page in this repo');
    // A chain (A → B → C) wastes a hop and hides the real target.
    if (r.kind === 'redirect' && redirectFroms.has(r.to.replace(/\/$/, ''))) bad('"to" is itself redirected (chain)');
    // Vercel evaluates redirects before the filesystem, so a redirect from a live page would hide it.
    if (r.kind === 'redirect' && !isPattern(r.from) && r.from !== '/' && pageExists(r.from.replace(/^\//, ''))) bad('"from" is a live page; a redirect would shadow it');
    if (r.kind === 'keep' && !pageExists(r.from.replace(/^\//, ''))) bad('kept URL has no page');
  }
  return errors;
}

export function toVercelSource(from) {
  if (hasExt(from)) return from;
  return from.endsWith('/') ? from : `${from}/`;
}

function render(rows, config) {
  const redirects = rows.filter((r) => r.kind === 'redirect')
    .map((r) => ({ source: toVercelSource(r.from), destination: r.to, permanent: true }));
  const next = { ...config, redirects };
  // One redirect per line keeps the diff of a single mapping change to a single line.
  const body = JSON.stringify(next, null, 2).replace(
    /"redirects": \[[\s\S]*?\n  \]/,
    `"redirects": [\n${redirects.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]`,
  );
  return `${body}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = loadRows();
  const errors = validate(rows);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const current = readFileSync(CONFIG, 'utf8');
  const out = render(rows, JSON.parse(current));
  if (process.argv.includes('--check')) {
    if (out !== current) { console.error('vercel.json is out of date: run node scripts/build-redirects.mjs'); process.exit(1); }
    console.log('vercel.json redirects are up to date');
  } else {
    writeFileSync(CONFIG, out);
    console.log(`vercel.json: ${rows.filter((r) => r.kind === 'redirect').length} redirects (${rows.filter((r) => r.kind === 'keep').length} kept URLs verified on disk)`);
  }
}
