// Structural checks on a blog post's content JSON, run by the build (scripts/check-content.mjs) and
// by scripts/new-post.mjs. The OS's website-publish function enforces the same rules in
// supabase/functions/_shared/siteGuard.ts before it commits a post. Each rule is a defect that once
// shipped (2026-10-02 SEO audit): pillar hubs that 404'd, body links without the trailing slash or
// to missing pages, body JSON-LD naming other domains or repeating the template's nodes, and
// reviewer notes left in the copy.
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

/** @param c the post JSON  @param pageExists (route without slashes) => boolean */
export function postProblems(c, pageExists) {
  const problems = [];
  for (const k of REQUIRED_FIELDS) if (!c[k]) problems.push(`missing "${k}"`);
  if (problems.length) return problems;
  if (c.description.length > 165) problems.push(`description too long (${c.description.length})`);
  const pillar = String(c.pillar.path).replace(/^\/+|\/+$/g, '');
  if (!pageExists(pillar)) problems.push(`pillar "${pillar}" has no hub page — use an existing pillar or publish its hub first`);
  const self = String(c.path).replace(/^\/+|\/+$/g, '');
  for (const [, href] of String(c.body).matchAll(/href="(\/[^"#?]*)/g)) {
    if (/\.[a-z0-9]+$/i.test(href) || href.startsWith('/api/')) continue;
    if (!href.endsWith('/')) { problems.push(`link ${href} needs a trailing slash`); continue; }
    const target = href.replace(/^\/+|\/+$/g, '');
    if (target !== self && !pageExists(target)) problems.push(`link ${href} points at a page that does not exist`);
  }
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
