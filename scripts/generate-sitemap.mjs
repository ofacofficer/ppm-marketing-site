#!/usr/bin/env node
// Write dist/sitemap.xml from the pages the build produced. Runs as part of `npm run build`
// (scripts/postbuild.mjs), after Astro and after any legacy root pages are copied through, so the
// sitemap lists exactly the pages that deploy.
//
// <lastmod> is given only where a page has a real edit date: a post (content/blog, and the
// hand-built posts in src/lib/content-index.mjs) or an area page (content/areas) that states
// dateModified or datePublished. Everything else has no <lastmod>: the build time is not an edit
// time, so every deploy would claim every page changed and teach Google to ignore the field.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../src/site.config.mjs';
import { HAND_BUILT_POSTS, effectiveDate } from '../src/lib/content-index.mjs';
import { trim } from '../src/lib/post-body.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = site.baseUrl;
const SKIP = new Set(['_astro', 'api', 'images', 'scripts', 'styles', 'js']);
// Built pages that are not for search: the listing template is filled in by script from a query
// string, so its one URL is the same empty shell for every rental.
const EXCLUDE = new Set([`${BASE}/rentals/listing/`]);

const jsonFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [])
  .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))]);
const lastmod = new Map();
for (const [, p] of jsonFiles(join(ROOT, 'content/blog'))) if (effectiveDate(p)) lastmod.set(`${BASE}/${trim(p.path)}/`, effectiveDate(p));
for (const p of HAND_BUILT_POSTS) lastmod.set(`${BASE}/${trim(p.path)}/`, effectiveDate(p));
for (const [slug, a] of jsonFiles(join(ROOT, 'content/areas'))) if (effectiveDate(a)) lastmod.set(`${BASE}/service-areas/${slug}/`, effectiveDate(a));

if (!existsSync(DIST)) { console.error('dist/ not found: run `npm run build`'); process.exit(1); }
const urls = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    if (rel === '' && SKIP.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walk(abs, rel === '' ? name : `${rel}/${name}`);
    } else if (name === 'index.html') {
      const url = rel === '' ? `${BASE}/` : `${BASE}/${rel}/`;
      if (!EXCLUDE.has(url)) urls.push(url);
    }
  }
})(DIST, '');
urls.sort();

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc>${lastmod.has(u) ? `<lastmod>${lastmod.get(u)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
writeFileSync(join(DIST, 'sitemap.xml'), xml);
console.log(`dist/sitemap.xml written with ${urls.length} URLs (${urls.filter((u) => lastmod.has(u)).length} with <lastmod>)`);
