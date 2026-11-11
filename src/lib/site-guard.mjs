// Structural checks on a blog post's content JSON, run by the build (scripts/check-content.mjs) and
// by scripts/new-post.mjs. The OS's website-publish function enforces the same rules in
// supabase/functions/_shared/siteGuard.ts before it commits a post. Each rule is a defect that once
// shipped (2026-10-02 SEO audit): pillar hubs that 404'd, body links without the trailing slash or
// to missing pages, body JSON-LD naming other domains or repeating the template's nodes, and
// reviewer notes left in the copy. The optional fields of the content contract (docs/CONTENT_SCHEMA.md)
// are checked here too: dates real and not in the future, FAQ / sources / local facts well formed
// (https only), and (areaProblems) county town lists, slugs and links. External links in a post body
// are not refused: published posts already cite sources inline.
import { REQUIRED_FIELDS } from './post-body.mjs';

export const BASE = 'https://www.njpropertymanager.com';
// Types the post layout already emits for every post; a second copy in the body only conflicts.
const TEMPLATE_LD_TYPES = new Set(['LocalBusiness', 'ProfessionalService', 'LegalService', 'Organization', 'BreadcrumbList', 'WebSite', 'BlogPosting', 'Article']);

// Reviewer and draft notes that must never publish. Bracketed markers ("[verify]", "[TODO: …]"), and
// the unbracketed review notes that shipped on /blog/rent-control/nj-rent-control-by-town/ until
// 2026-11-09 ("attorney-review-pending", "Attorney-review note: …"). The plain phrase "attorney review"
// is not matched on its own: NJ's three-day attorney review period is legitimate copy.
const DRAFT_NOTE_PATTERNS = [
  /\[(?:attorney review|verify|todo|insert|tbd|citation needed)[^\]]*\]?/gi,
  /\battorney-review\b[\w-]*(?: note)?/gi,
  /\b[\w]+-review-pending\b|\breview[- ]pending\b/gi,
  /\b(?:reviewer|editor|drafter|internal|draft) note\s*:/gi,
];

/** Every draft or reviewer note in a piece of copy (HTML or text). */
export function draftNotes(text) {
  const found = [];
  for (const re of DRAFT_NOTE_PATTERNS) for (const [m] of String(text ?? '').matchAll(re)) found.push(m);
  return [...new Set(found)];
}

/** Today's date in New Jersey, YYYY-MM-DD: a page may not claim a date after it. */
export function todayNJ(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (d) => ISO_DATE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isHttps = (u) => { try { return isText(u) && /^https:\/\//.test(u) && !/[\s"<>]/.test(u) && Boolean(new URL(u).hostname); } catch { return false; } };

/** datePublished / dateModified: real calendar dates, not in the future, modified >= published. */
function dateProblems(c, today, { publishedRequired }) {
  const out = [];
  for (const k of ['datePublished', 'dateModified']) {
    if (c[k] === undefined) { if (k === 'datePublished' && publishedRequired) out.push('missing "datePublished"'); continue; }
    if (!realDate(c[k])) out.push(`${k} "${c[k]}" is not a real YYYY-MM-DD date`);
    else if (c[k] > today) out.push(`${k} ${c[k]} is in the future (today is ${today})`);
  }
  if (c.dateModified !== undefined && c.datePublished === undefined) out.push('dateModified needs a datePublished');
  if (realDate(c.dateModified) && realDate(c.datePublished) && c.dateModified < c.datePublished)
    out.push(`dateModified ${c.dateModified} is before datePublished ${c.datePublished}`);
  return out;
}

/** faq: a non-empty list of { question, answer }, both non-empty text. */
function faqProblems(faq, where = 'faq') {
  if (faq === undefined) return [];
  if (!Array.isArray(faq) || !faq.length) return [`${where} must be a non-empty list of { question, answer }`];
  const out = [];
  faq.forEach((q, i) => {
    if (!q || typeof q !== 'object' || !isText(q.question) || !isText(q.answer)) out.push(`${where}[${i}] needs a non-empty "question" and "answer"`);
    else for (const m of draftNotes(`${q.question} ${q.answer}`)) out.push(`draft marker left in ${where}[${i}]: ${m.slice(0, 60)}`);
  });
  return out;
}

/** Internal links in some HTML: trailing slash, and the page must exist. */
function linkProblems(html, pageExists, self = null) {
  const out = [];
  for (const [, href] of String(html).matchAll(/href="(\/[^"#?]*)/g)) {
    if (/\.[a-z0-9]+$/i.test(href) || href.startsWith('/api/')) continue;
    if (!href.endsWith('/')) { out.push(`link ${href} needs a trailing slash`); continue; }
    const target = href.replace(/^\/+|\/+$/g, '');
    if (target !== self && !pageExists(target)) out.push(`link ${href} points at a page that does not exist`);
  }
  return out;
}

/** @param c the post JSON  @param pageExists (route without slashes) => boolean
 *  @param opts.today YYYY-MM-DD to judge "in the future" by (default: today in New Jersey)
 *  @param opts.extras the post's content/blog-extras JSON, if it has one */
export function postProblems(c, pageExists, { today = todayNJ(), extras } = {}) {
  const problems = [];
  for (const k of REQUIRED_FIELDS) if (!c[k]) problems.push(`missing "${k}"`);
  if (problems.length) return problems;
  if (c.description.length > 165) problems.push(`description too long (${c.description.length})`);
  problems.push(...dateProblems(c, today, { publishedRequired: true }));
  if (c.audience !== undefined && !['owner', 'tenant'].includes(c.audience)) problems.push(`audience must be "owner" or "tenant", not ${JSON.stringify(c.audience)}`);
  if (c.primaryKeyword !== undefined && !isText(c.primaryKeyword)) problems.push('primaryKeyword must be non-empty text');
  if (c.legalDisclaimer !== undefined && typeof c.legalDisclaimer !== 'boolean') problems.push('legalDisclaimer must be true or false');
  problems.push(...faqProblems(c.faq));
  if (c.faq !== undefined && extras?.faq !== undefined) problems.push('faq is in both the post JSON and its content/blog-extras file; keep one');
  if (c.sources !== undefined) {
    if (!Array.isArray(c.sources) || !c.sources.length) problems.push('sources must be a non-empty list of { title, url }');
    else c.sources.forEach((src, i) => {
      if (!src || typeof src !== 'object' || !isText(src.title)) problems.push(`sources[${i}] needs a non-empty "title"`);
      if (!src || !isHttps(src.url)) problems.push(`sources[${i}].url must be an https:// URL`);
    });
  }

  const pillar = String(c.pillar.path).replace(/^\/+|\/+$/g, '');
  if (!pageExists(pillar)) problems.push(`pillar "${pillar}" has no hub page — use an existing pillar or publish its hub first`);
  const self = String(c.path).replace(/^\/+|\/+$/g, '');
  problems.push(...linkProblems(c.body, pageExists, self));
  for (const marker of draftNotes(c.body)) problems.push(`draft marker left in the body: ${marker.slice(0, 60)}`);
  for (const [, blob] of String(c.body).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let ld;
    try { ld = JSON.parse(blob); } catch { problems.push('body JSON-LD is not valid JSON'); continue; }
    const nodes = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
    for (const n of nodes) {
      const types = [].concat(n['@type'] || []);
      if (types.some((t) => TEMPLATE_LD_TYPES.has(t))) problems.push(`body JSON-LD repeats ${types.join('/')}, which the template already emits`);
    }
    for (const url of blob.match(/https?:\/\/[^"\s]+/g) || [])
      if (!url.startsWith(BASE) && !url.startsWith('https://schema.org')) problems.push(`body JSON-LD names a URL off this site: ${url}`);
  }
  return problems;
}

export const AREA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Structural checks on an area page's content JSON (content/areas/<slug>.json).
 * @param slug the file name without .json (the URL is /service-areas/<slug>/)
 * @param a the area JSON  @param areaSlugs every area slug, this one included
 * @param pageExists (route without slashes) => boolean  @param opts.today as for postProblems */
export function areaProblems(slug, a, areaSlugs, pageExists, { today = todayNJ() } = {}) {
  const problems = [];
  if (!AREA_SLUG.test(slug)) problems.push(`file name "${slug}" must be lowercase words joined by hyphens (it is the URL)`);
  const kind = a.kind ?? 'town';
  if (!['town', 'county'].includes(kind)) problems.push(`kind must be "town" or "county", not ${JSON.stringify(a.kind)}`);
  for (const k of ['name', 'county', 'h1', 'intro', 'breadcrumbHubLabel', 'contentHtml']) if (!isText(a[k])) problems.push(`missing "${k}"`);
  if (typeof a.rentControl !== 'boolean') problems.push('rentControl must be true or false');
  if (!a.seo || !isText(a.seo.title) || !isText(a.seo.description)) problems.push('seo needs a "title" and a "description"');
  if (!a.sidebar || !isText(a.sidebar.nearbyLabel) || !Array.isArray(a.sidebar.nearby) || !Array.isArray(a.sidebar.guides)) problems.push('sidebar needs "nearbyLabel", "nearby" and "guides"');
  if (!a.cta || !isText(a.cta.heading) || !isText(a.cta.text)) problems.push('cta needs a "heading" and "text"');
  problems.push(...dateProblems(a, today, { publishedRequired: false }));
  if (a.towns !== undefined) {
    if (kind !== 'county') problems.push('towns is for county pages (kind "county") only');
    if (!Array.isArray(a.towns)) problems.push('towns must be a list of area slugs');
    else for (const t of a.towns) {
      if (t === slug) problems.push('towns lists the county page itself');
      else if (!areaSlugs.has(t)) problems.push(`towns lists "${t}", which has no content/areas/${t}.json`);
    }
  }
  problems.push(...faqProblems(a.faq));
  if (a.localFacts !== undefined) {
    if (!Array.isArray(a.localFacts) || !a.localFacts.length) problems.push('localFacts must be a non-empty list of { label, text, sourceTitle, sourceUrl }');
    else a.localFacts.forEach((f, i) => {
      if (!f || typeof f !== 'object' || !isText(f.label) || !isText(f.text) || !isText(f.sourceTitle)) problems.push(`localFacts[${i}] needs a non-empty "label", "text" and "sourceTitle"`);
      if (!f || !isHttps(f.sourceUrl)) problems.push(`localFacts[${i}].sourceUrl must be an https:// URL`);
    });
  }
  const links = [a.contentHtml, ...[...(a.sidebar?.nearby ?? []), ...(a.sidebar?.guides ?? [])].map((l) => `href="${l?.href ?? ''}"`)].join(' ');
  problems.push(...linkProblems(links, pageExists, `service-areas/${slug}`));
  return problems;
}
