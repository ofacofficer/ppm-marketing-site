#!/usr/bin/env node
// Check a blog post's content JSON before it is committed.
//
//   node scripts/new-post.mjs content/blog/<slug>.json [more.json ...]
//   node scripts/new-post.mjs --all
//   node scripts/new-post.mjs --all --template-out /tmp/posts   # also render via the legacy template
//
// Since Phase 1 the site is built by Astro: a post is ONE file, content/blog/<slug>.json, and
// `npm run build` renders it at its `path` (src/pages/[...post].astro, src/layouts/Post.astro).
// This script no longer writes pages into the repo. A rendered <path>/index.html does not need to be
// committed, and if one is, the build ignores it in favour of the JSON (scripts/postbuild.mjs).
//
// Schema of a content file (unchanged; the OS's website-publish function writes the same shape):
//
// {
//   "path": "blog/nj-landlord-law/eviction-process-nj",  // page dir, no slashes at ends
//   "title": "How to Evict a Tenant in New Jersey",       // h1 + breadcrumb
//   "titleTag": "optional <title>; defaults to title",
//   "description": "meta description, <= 165 chars",
//   "pillar": { "name": "NJ Landlord Law", "path": "blog/nj-landlord-law" },
//   "author": "Proactive Property Management",            // visible byline
//   "authorType": "Organization",                          // or "Person"
//   "datePublished": "2026-07-11",
//   "body": "<h2 id=...>...</h2><p>...</p>..."             // article HTML
// }
//
// Optional per-post additions (FAQPage JSON-LD, a social title, the legal-disclaimer line) go in
// content/blog-extras/<slug>.json, never in the post JSON, so an OS republish cannot drop them.
//
// Site-structure checks (src/lib/site-guard.mjs; mirrored in the OS's _shared/siteGuard.ts, and run
// on every post by `npm run build`): the pillar must be an existing hub page, every internal link in
// the body must point at a page that exists (with its trailing slash), body JSON-LD may only describe
// this site, and no reviewer note ([Attorney Review Required], [VERIFY]) may be left in the copy.
//
// --template-out renders each post through scripts/templates/post.html, the template the OS's
// website-publish function still fetches during the transition, into the given directory (never
// into the repo), so the two renderings can be compared.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postProblems } from '../src/lib/site-guard.mjs';
import { siteRoutes } from '../src/lib/routes.mjs';
import { postBodyHtml, postDates, postJsonLd, trim } from '../src/lib/post-body.mjs';
import { site } from '../src/site.config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function renderWithTemplate(c) {
  const template = readFileSync(join(ROOT, 'scripts/templates/post.html'), 'utf8');
  const { url, pillarPath, posting, breadcrumb } = postJsonLd(c, site.baseUrl);
  const dates = postDates(c.datePublished);
  const vars = {
    TITLE: c.title, TITLE_TAG: c.titleTag || c.title, DESCRIPTION: c.description, URL: url,
    PILLAR_NAME: c.pillar.name, PILLAR_PATH: pillarPath,
    AUTHOR: c.author, DATE_LABEL: dates.label, DATE_ISO: c.datePublished, DATE_HUMAN: dates.human,
    JSONLD_POSTING: JSON.stringify(posting), JSONLD_BREADCRUMB: JSON.stringify(breadcrumb), BODY_HTML: postBodyHtml(c.body),
  };
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v);
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unreplaced token ${left[0]}`);
  return out;
}

const args = process.argv.slice(2);
let templateOut = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--template-out') templateOut = resolve(args[++i]);
  else if (args[i] === '--all') files.push(...readdirSync(join(ROOT, 'content/blog')).filter((f) => f.endsWith('.json')).map((f) => join(ROOT, 'content/blog', f)));
  else files.push(args[i]);
}
if (!files.length) { console.error('usage: node scripts/new-post.mjs <content.json ...> | --all [--template-out <dir>]'); process.exit(1); }

const routes = siteRoutes(ROOT);
let failed = 0;
for (const f of files) {
  const c = JSON.parse(readFileSync(f, 'utf8'));
  const self = trim(c.path || '');
  // The post's own URL counts as existing, so a new post may link to itself.
  const problems = postProblems(c, (r) => r === self || routes.has(r));
  if (problems.length) { failed++; console.error(`REFUSED ${f}:\n  ${problems.join('\n  ')}`); continue; }
  if (templateOut) {
    const out = join(templateOut, self, 'index.html');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderWithTemplate(c));
    console.log(`ok /${self}/ (template render: ${out})`);
  } else {
    console.log(`ok /${self}/ — \`npm run build\` renders it`);
  }
}
if (failed) process.exit(1);
