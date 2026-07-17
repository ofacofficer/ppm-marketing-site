#!/usr/bin/env node
// Regenerate sitemap.xml from the pages on disk. Run from the repo root
// after adding or removing a page:  node scripts/generate-sitemap.mjs
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.njpropertymanager.com';
const SKIP = new Set(['.git', '.netlify', '_astro', 'api', 'images', 'scripts', 'styles']);

const urls = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    if (rel === '' && SKIP.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walk(abs, rel === '' ? name : `${rel}/${name}`);
    } else if (name === 'index.html') {
      const loc = rel === '' ? `${BASE}/` : `${BASE}/${rel}/`;
      const lastmod = statSync(abs).mtime.toISOString().slice(0, 10); // YYYY-MM-DD from file mtime
      urls.push({ loc, lastmod });
    }
  }
})(ROOT, '');
urls.sort((a, b) => a.loc.localeCompare(b.loc));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml written with ${urls.length} URLs`);
