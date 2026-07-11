#!/usr/bin/env node
// Render a blog post from a content JSON file into a full static page.
//
//   node scripts/new-post.mjs content/blog/<slug>.json [more.json ...]
//   node scripts/new-post.mjs --all          # render every content/blog/*.json
//
// The content JSON is the editable source of truth for a post; the page under
// blog/ is generated output. After rendering, this script regenerates
// sitemap.xml. Schema of a content file:
//
// {
//   "path": "blog/nj-landlord-law/eviction-process-nj",  // page dir, no slashes at ends
//   "title": "How to Evict a Tenant in New Jersey",       // h1 + breadcrumb
//   "titleTag": "optional <title>; defaults to title",
//   "description": "meta description, <= 160 chars",
//   "pillar": { "name": "NJ Landlord Law", "path": "blog/nj-landlord-law" },
//   "author": "Proactive Property Management",            // visible byline
//   "authorType": "Organization",                          // or "Person"
//   "datePublished": "2026-07-11",
//   "body": "<h2 id=...>...</h2><p>...</p>..."             // article HTML
// }
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.njpropertymanager.com';
const TEMPLATE = readFileSync(join(ROOT, 'scripts/templates/post.html'), 'utf8');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function render(contentPath) {
  const c = JSON.parse(readFileSync(contentPath, 'utf8'));
  for (const k of ['path', 'title', 'description', 'pillar', 'author', 'authorType', 'datePublished', 'body'])
    if (!c[k]) throw new Error(`${contentPath}: missing "${k}"`);
  if (c.description.length > 165) throw new Error(`${contentPath}: description too long (${c.description.length})`);

  const url = `${BASE}/${c.path}/`;
  const pillarPath = `/${c.pillar.path}/`;
  const [y, m, d] = c.datePublished.split('-').map(Number);
  const dateHuman = `${MONTHS[m - 1]} ${d}, ${y}`;
  const titleTag = c.titleTag || c.title;

  const posting = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: c.title, description: c.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: `${BASE}/og-image.jpg`,
    publisher: { '@type': 'Organization', name: 'Proactive Property Management',
      logo: { '@type': 'ImageObject', url: `${BASE}/images/logo-white-horizontal.png` } },
    author: { '@type': c.authorType, name: c.author },
    datePublished: c.datePublished,
  });
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Resources', item: `${BASE}/blog/` },
      { '@type': 'ListItem', position: 3, name: c.pillar.name, item: `${BASE}${pillarPath}` },
      { '@type': 'ListItem', position: 4, name: c.title, item: url },
    ],
  });

  // Standard mid-article CTA: honor an explicit <!--MID_CTA--> marker, else
  // insert before the third h2 when the post is long enough to carry it.
  const MID_CTA = '<div class="blog-mid-cta">\n<p>Tired of managing this yourself? PPM handles it all — one flat fee, no surprises.</p>\n<a href="/contact/" class="btn btn-gold" style="font-size:13px;">Get a Free Rental Analysis →</a>\n</div>\n';
  let body = c.body;
  if (body.includes('<!--MID_CTA-->')) {
    body = body.replace('<!--MID_CTA-->', MID_CTA);
  } else {
    const h2s = [...body.matchAll(/<h2[\s>]/g)];
    if (h2s.length >= 4) {
      const at = h2s[2].index;
      body = body.slice(0, at) + MID_CTA + body.slice(at);
    }
  }
  if (!/Get in touch|<hr>/.test(body.slice(-400))) {
    body += '\n<hr>\n<p><em>Proactive Property Management handles this for every property under management. Questions about your NJ rental? <a href="/contact/">Get in touch</a>.</em></p>';
  }

  const vars = {
    TITLE: c.title, TITLE_TAG: titleTag, DESCRIPTION: c.description, URL: url,
    PILLAR_NAME: c.pillar.name, PILLAR_PATH: pillarPath,
    AUTHOR: c.author, DATE_LABEL: `Published ${MONTHS[m - 1]} ${y}`,
    DATE_ISO: c.datePublished, DATE_HUMAN: dateHuman,
    JSONLD_POSTING: posting, JSONLD_BREADCRUMB: breadcrumb, BODY_HTML: body,
  };
  let out = TEMPLATE;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v);
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`${contentPath}: unreplaced token ${left[0]}`);

  const dir = join(ROOT, c.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), out);
  console.log(`rendered ${c.path}/index.html (${out.length} bytes)`);
}

const args = process.argv.slice(2);
const files = args.includes('--all')
  ? readdirSync(join(ROOT, 'content/blog')).filter((f) => f.endsWith('.json')).map((f) => join(ROOT, 'content/blog', f))
  : args;
if (!files.length) { console.error('usage: node scripts/new-post.mjs <content.json ...> | --all'); process.exit(1); }
files.forEach(render);
execFileSync('node', [join(ROOT, 'scripts/generate-sitemap.mjs')], { stdio: 'inherit' });
