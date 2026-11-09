#!/usr/bin/env node
// Pre-build check of the site's content (runs as `prebuild`, so `npm run build` and the Vercel
// build both enforce it). The same structural rules the OS's website-publish function applies
// before it commits a post (supabase/functions/_shared/siteGuard.ts), applied to every post in the
// repo, plus checks that two sources never claim one URL.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postProblems } from '../src/lib/site-guard.mjs';
import { siteRoutes, sourcePageRoutes, postRoutes, areaRoutes, legacyRootRoutes } from '../src/lib/routes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const routes = siteRoutes(ROOT);
const problems = [];

const blogDir = join(ROOT, 'content/blog');
for (const f of readdirSync(blogDir).filter((x) => x.endsWith('.json'))) {
  let c;
  try { c = JSON.parse(readFileSync(join(blogDir, f), 'utf8')); } catch (e) { problems.push(`content/blog/${f}: not valid JSON (${e.message})`); continue; }
  for (const p of postProblems(c, (r) => routes.has(r))) problems.push(`content/blog/${f}: ${p}`);
  if (c.path && !String(c.path).replace(/^\/+/, '').startsWith('blog/')) problems.push(`content/blog/${f}: path must start with blog/`);
}
const extrasDir = join(ROOT, 'content/blog-extras');
const posts = new Set(readdirSync(blogDir));
for (const f of readdirSync(extrasDir)) if (!posts.has(f)) problems.push(`content/blog-extras/${f}: no post content/blog/${f}`);

// One URL, one source. (A pre-rendered page committed at the repo root is the exception: it is
// copied through only when no source claims its URL, and otherwise ignored; see postbuild.mjs.)
const owners = new Map();
const claim = (r, who) => { if (owners.has(r)) problems.push(`/${r}/ is built by both ${owners.get(r)} and ${who}`); else owners.set(r, who); };
sourcePageRoutes(ROOT).forEach((r) => claim(r, `src/pages/${r ? r + '/' : ''}index.astro`));
postRoutes(ROOT).forEach((r) => claim(r, 'a content/blog post'));
areaRoutes(ROOT).forEach((r) => claim(r, 'a content/areas town'));

const shadowed = legacyRootRoutes(ROOT).filter((r) => owners.has(r));
if (shadowed.length) console.log(`note: ${shadowed.length} pre-rendered root page(s) are superseded by source and will be ignored: ${shadowed.map((r) => `${r}/index.html`).join(', ')}`);

if (problems.length) { console.error(`content check failed:\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log(`content check: ${posts.size} posts, ${areaRoutes(ROOT).length} towns, ${owners.size} source routes OK`);
