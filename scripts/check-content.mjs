#!/usr/bin/env node
// Pre-build check of the site's content (runs as `prebuild`, so `npm run build` and the Vercel
// build both enforce it). The same structural rules the OS's website-publish function applies
// before it commits a post (supabase/functions/_shared/siteGuard.ts), applied to every post in the
// repo, plus checks that two sources never claim one URL. The content contract the OS writes to is
// docs/CONTENT_SCHEMA.md; every rule there that zod cannot express is enforced here.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postProblems, areaProblems, draftNotes } from '../src/lib/site-guard.mjs';
import { siteRoutes, sourcePageRoutes, postRoutes, areaRoutes, legacyRootRoutes } from '../src/lib/routes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const routes = siteRoutes(ROOT);
const problems = [];

const readJson = (rel) => {
  try { return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')); } catch (e) { problems.push(`${rel}: not valid JSON (${e.message})`); return null; }
};
const blogDir = join(ROOT, 'content/blog');
const extrasDir = join(ROOT, 'content/blog-extras');
for (const f of readdirSync(blogDir).filter((x) => x.endsWith('.json'))) {
  const c = readJson(`content/blog/${f}`);
  if (!c) continue;
  const extras = existsSync(join(extrasDir, f)) ? readJson(`content/blog-extras/${f}`) ?? undefined : undefined;
  for (const p of postProblems(c, (r) => routes.has(r), { extras })) problems.push(`content/blog/${f}: ${p}`);
  if (c.path && !String(c.path).replace(/^\/+/, '').startsWith('blog/')) problems.push(`content/blog/${f}: path must start with blog/`);
}

// Area pages (towns and counties).
const areasDir = join(ROOT, 'content/areas');
const areaFiles = readdirSync(areasDir).filter((x) => x.endsWith('.json'));
const areaSlugs = new Set(areaFiles.map((f) => f.replace(/\.json$/, '')));
// A redirect from /service-areas/<slug>/ (a town that had no page yet) runs before the filesystem on
// Vercel, so it would hide a new page at that URL: the redirect row has to go first.
const redirected = new Set((JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).redirects || [])
  .map((r) => r.source).filter((src) => !/[:*(]/.test(src)).map((src) => src.replace(/^\/+|\/+$/g, '')));
for (const f of areaFiles) {
  const a = readJson(`content/areas/${f}`);
  if (!a) continue;
  const slug = f.replace(/\.json$/, '');
  for (const p of areaProblems(slug, a, areaSlugs, (r) => routes.has(r))) problems.push(`content/areas/${f}: ${p}`);
  if (redirected.has(`service-areas/${slug}`)) problems.push(`content/areas/${f}: /service-areas/${slug}/ is redirected (content/redirects/*.csv), which would hide the page; remove that redirect row first`);
}
const posts = new Set(readdirSync(blogDir));
for (const f of readdirSync(extrasDir)) if (!posts.has(f)) problems.push(`content/blog-extras/${f}: no post content/blog/${f}`);

// Draft and reviewer notes anywhere else that publishes: post FAQ extras, town pages, one-off page
// bodies. (Post bodies are covered by postProblems above.)
const noteSources = [
  ...readdirSync(extrasDir).filter((x) => x.endsWith('.json')).map((f) => `content/blog-extras/${f}`),
  ...readdirSync(join(ROOT, 'content/areas')).filter((x) => x.endsWith('.json')).map((f) => `content/areas/${f}`),
  ...readdirSync(join(ROOT, 'src/bodies'), { recursive: true }).filter((x) => String(x).endsWith('.html')).map((f) => `src/bodies/${f}`),
];
for (const f of noteSources)
  for (const m of draftNotes(readFileSync(join(ROOT, f), 'utf8'))) problems.push(`${f}: draft marker left in the copy: ${m.slice(0, 60)}`);

// One URL, one source. (A pre-rendered page committed at the repo root is the exception: it is
// copied through only when no source claims its URL, and otherwise ignored; see postbuild.mjs.)
const owners = new Map();
const claim = (r, who) => { if (owners.has(r)) problems.push(`/${r}/ is built by both ${owners.get(r)} and ${who}`); else owners.set(r, who); };
sourcePageRoutes(ROOT).forEach((r) => claim(r, `src/pages/${r ? r + '/' : ''}index.astro`));
postRoutes(ROOT).forEach((r) => claim(r, 'a content/blog post'));
areaRoutes(ROOT).forEach((r) => claim(r, 'a content/areas page'));

const shadowed = legacyRootRoutes(ROOT).filter((r) => owners.has(r));
if (shadowed.length) console.log(`note: ${shadowed.length} pre-rendered root page(s) are superseded by source and will be ignored: ${shadowed.map((r) => `${r}/index.html`).join(', ')}`);

if (problems.length) { console.error(`content check failed:\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log(`content check: ${posts.size} posts, ${areaRoutes(ROOT).length} area pages, ${owners.size} source routes OK`);
