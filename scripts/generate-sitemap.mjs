#!/usr/bin/env node
// Write dist/sitemap.xml from the pages the build produced. Runs as part of `npm run build`
// (scripts/postbuild.mjs), after Astro and after any legacy root pages are copied through, so the
// sitemap lists exactly the pages that deploy.
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../src/site.config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = site.baseUrl;
const SKIP = new Set(['_astro', 'api', 'images', 'scripts', 'styles', 'js']);

if (!existsSync(DIST)) { console.error('dist/ not found: run `npm run build`'); process.exit(1); }
const urls = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    if (rel === '' && SKIP.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walk(abs, rel === '' ? name : `${rel}/${name}`);
    } else if (name === 'index.html') {
      // No <lastmod>: the build time is not an edit time, so every deploy would claim every page
      // changed and teach Google to ignore the field.
      urls.push(rel === '' ? `${BASE}/` : `${BASE}/${rel}/`);
    }
  }
})(DIST, '');
urls.sort();

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(DIST, 'sitemap.xml'), xml);
console.log(`dist/sitemap.xml written with ${urls.length} URLs`);
