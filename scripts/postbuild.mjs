#!/usr/bin/env node
// Runs after `astro build` (npm run build). Three jobs, in order:
//
// 1. Legacy pre-rendered pages. Until the OS's website-publish function moves to content-only
//    commits, it may still commit finished HTML at the repo root: a blog post's <path>/index.html
//    next to its content/blog/<slug>.json, or a "files"-mode page such as a new landing page.
//    - If source already builds that URL (a post rendered from its JSON, any src/pages route, a
//      town from content/areas), the committed HTML is IGNORED and the build says so. Source wins,
//      always: the JSON is the post's source of truth and the committed HTML is a stale render.
//    - If nothing in source builds that URL, the file is COPIED THROUGH to dist/ unchanged, so a
//      "files"-mode publish still goes live. It must carry the Equal Housing statement.
// 2. dist/sitemap.xml, generated from what is in dist/ after step 1.
// 3. Guards: the obligations the site-health loop (website-drive) and the redesign gate check.
import { readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { legacyRootRoutes } from '../src/lib/routes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const failures = [];
const warnings = [];
const copiedThrough = new Set();

// 1. Legacy root pages.
for (const r of legacyRootRoutes(ROOT)) {
  const src = join(ROOT, r, 'index.html');
  const out = join(DIST, r, 'index.html');
  if (existsSync(out)) {
    console.log(`legacy page ignored: ${r ? r + '/' : ''}index.html (/${r ? r + '/' : ''} is built from source)`);
    continue;
  }
  const html = readFileSync(src, 'utf8');
  if (!/Equal Housing Opportunity/i.test(html)) { failures.push(`${r}/index.html: legacy page has no Equal Housing Opportunity statement`); continue; }
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(src, out);
  copiedThrough.add(r);
  console.log(`legacy page copied through: /${r ? r + '/' : ''}`);
}
if (existsSync(join(ROOT, 'sitemap.xml'))) console.log('note: the repo-root sitemap.xml is ignored; dist/sitemap.xml is generated from the build');

// 2. Sitemap.
execFileSync(process.execPath, [join(ROOT, 'scripts/generate-sitemap.mjs')], { stdio: 'inherit' });

// 3. Guards.
const pages = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, rel ? `${rel}/${name}` : name);
    else if (name === 'index.html') pages.push(rel);
  }
})(DIST, '');
const read = (r) => readFileSync(join(DIST, r, 'index.html'), 'utf8');
for (const r of pages) {
  const html = read(r);
  const at = `/${r ? r + '/' : ''}`;
  // A copied-through legacy page is someone else's finished HTML: hold it to the Equal Housing rule
  // (checked above) and report the rest without failing the build.
  const sink = copiedThrough.has(r) ? warnings : failures;
  if (!html.includes('Equal Housing Opportunity')) sink.push(`${at}: no Equal Housing Opportunity statement`);
  if (!html.includes('License #')) sink.push(`${at}: no supervising-broker license line`);
  if (!html.includes('class="skip-link"')) sink.push(`${at}: no skip link`);
  if (!html.includes('/_vercel/insights/script.js')) sink.push(`${at}: no Vercel Web Analytics script`);
  if (!html.includes('va("event",{name:"call_click"})')) sink.push(`${at}: no call_click hook`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { sink.push(`${at}: JSON-LD block is not valid JSON`); }
  }
}
// website-drive probes (WEBSITE_RUNBOOK.md §2).
const probes = [['', 'Equal Housing'], ['landlord-checklist', 'Compliance Checklist'], ['contact'], ['accessibility'], ['privacy'], ['terms'], ['blog']];
for (const [r, must] of probes) {
  if (!pages.includes(r)) failures.push(`probe /${r ? r + '/' : ''}: page missing`);
  else if (must && !read(r).includes(must)) failures.push(`probe /${r ? r + '/' : ''}: does not contain "${must}"`);
}
for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt', 'favicon.svg', 'og-image.jpg', 'js/attribution.js', 'styles/global.css'])
  if (!existsSync(join(DIST, f))) failures.push(`dist/${f} missing`);

if (warnings.length) console.warn(`postbuild warnings (copied-through legacy pages):\n  ${warnings.join('\n  ')}`);
if (failures.length) { console.error(`postbuild checks failed:\n  ${failures.join('\n  ')}`); process.exit(1); }
console.log(`postbuild: ${pages.length} pages pass the footer, analytics, JSON-LD and site-health checks`);
