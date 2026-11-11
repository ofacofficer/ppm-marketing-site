// Generated indexes of the site's content: the post lists on /blog/ and the pillar hubs, related
// posts, the town and county list on /service-areas/, and the dates the sitemap and llms.txt carry.
// Everything here is computed from content/blog/*.json and content/areas/*.json at build time, so a
// post or area page the OS publishes (one JSON file, committed to main) is listed, linked and dated
// with no hand edit anywhere. Plain ESM with no Astro or fs imports: the Astro pages pass in
// getCollection() data, and the build scripts pass in the parsed JSON files.
import { postDates, trim } from './post-body.mjs';

/** A post page that is hand-built in src/pages rather than rendered from content/blog. It is listed
 * with the posts of its pillar. Add an entry only for such a page; content/blog posts list
 * themselves. */
export const HAND_BUILT_POSTS = [
  {
    path: 'blog/nj-landlord-law/security-deposit-rules',
    title: 'NJ Security Deposit Rules: Limits, Storage, Interest, and Return',
    description: 'New Jersey security deposit law explained — maximum amounts, where to hold deposits, annual interest requirements, return deadlines, and penalties for violations.',
    pillar: { name: 'NJ Landlord Law', path: 'blog/nj-landlord-law' },
    datePublished: '2024-08-05',
    audience: 'owner',
  },
];

export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The date a page last changed: dateModified when given, else datePublished. */
export const effectiveDate = (p) => p.dateModified || p.datePublished;

/** Post data (from getCollection or the JSON files) plus the hand-built posts, as list entries,
 * newest first (by dateModified || datePublished; ties by title so the order is stable). */
export function postEntries(posts) {
  const all = [...posts, ...HAND_BUILT_POSTS].map((p) => ({
    url: `/${trim(p.path)}/`,
    path: trim(p.path),
    title: p.title,
    description: p.description,
    pillarPath: trim(p.pillar.path),
    pillarName: p.pillar.name,
    datePublished: p.datePublished,
    dateModified: p.dateModified,
    audience: p.audience || 'owner',
  }));
  return all.sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)) || a.title.localeCompare(b.title));
}

/** "Updated July 11, 2026" or "July 11, 2026" (a post never edited shows its published date). */
function dateLine(e) {
  const human = postDates(effectiveDate(e)).human;
  return `<time datetime="${effectiveDate(e)}">${e.dateModified ? `Updated ${human}` : human}</time>`;
}

/** A list of posts: linked title, description, date. */
export function postListHtml(entries, { headingLevel = 3 } = {}) {
  if (!entries.length) return '';
  const h = `h${headingLevel}`;
  return `<ul class="post-index">${entries.map((e) =>
    `<li class="post-index-item"><${h} class="post-index-title"><a href="${e.url}">${escapeHtml(e.title)}</a></${h}><p class="post-index-desc">${escapeHtml(e.description)}</p><p class="post-index-date">${dateLine(e)}</p></li>`).join('')}</ul>`;
}

/** Replace a <!--GENERATED:name--> marker in a page body. A body that lost its marker fails the
 * build instead of silently dropping the generated list. */
export function fillMarker(html, name, insert) {
  const marker = `<!--GENERATED:${name}-->`;
  if (!html.includes(marker)) throw new Error(`page body has no ${marker} marker`);
  return html.split(marker).join(insert);
}

/** /blog/: the newest posts across every pillar. */
export function latestArticlesHtml(entries, count = 12) {
  if (!entries.length) return '';
  return `<section class="post-index-section" aria-labelledby="latest-title"><div class="wrap"><h2 id="latest-title">Latest articles</h2>${postListHtml(entries.slice(0, count))}</div></section>`;
}

/** /blog/: the posts under one pillar's entry in the topic list (newest five, then a link to the
 * hub when there are more). */
export function topicPostsHtml(entries, pillarPath, max = 5) {
  const mine = entries.filter((e) => e.pillarPath === trim(pillarPath));
  if (!mine.length) return '';
  const more = mine.length > max ? `<li class="topic-posts-more"><a href="/${trim(pillarPath)}/">All ${mine.length} articles</a></li>` : '';
  return `<ul class="topic-posts">${mine.slice(0, max).map((e) => `<li><a href="${e.url}">${escapeHtml(e.title)}</a></li>`).join('')}${more}</ul>`;
}

/** A pillar hub: every post whose pillar is this hub, newest first. */
export function pillarPostsHtml(entries, pillarPath, label) {
  const mine = entries.filter((e) => e.pillarPath === trim(pillarPath));
  if (!mine.length) return '';
  return `<section class="post-index-section" aria-labelledby="pillar-articles-title"><div class="container"><h2 id="pillar-articles-title">${escapeHtml(label)}: all articles</h2>${postListHtml(mine)}</div></section>`;
}

/** Up to `count` posts from the same pillar, newest first, excluding the post itself. */
export function relatedPosts(entries, post, count = 3) {
  const self = trim(post.path);
  return entries.filter((e) => e.pillarPath === trim(post.pillar.path) && e.path !== self).slice(0, count);
}

// ── Areas ────────────────────────────────────────────────────────────────

/** Area data (slug + JSON) as entries; kind defaults to "town". */
export function areaEntries(areas) {
  return areas.map(({ slug, data }) => ({ ...data, slug, url: `/service-areas/${slug}/`, kind: data.kind || 'town' }));
}

/** Areas grouped by county, counties A–Z; in each group the county page (kind "county") first, then
 * its towns A–Z. A town is grouped by its `county` field; a county page by its own `county` field
 * (which names itself, e.g. "Hudson County"). */
export function areasByCounty(areas) {
  const groups = new Map();
  for (const a of areaEntries(areas)) {
    if (!groups.has(a.county)) groups.set(a.county, []);
    groups.get(a.county).push(a);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([county, list]) => ({
      county,
      countyPage: list.find((a) => a.kind === 'county'),
      areas: list.sort((a, b) => (a.kind === 'county' ? 0 : 1) - (b.kind === 'county' ? 0 : 1) || a.name.localeCompare(b.name)),
    }));
}

const slugify = (s) => String(s).toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** /service-areas/: every area page, grouped by county. `attr` is the legacy scoped-CSS attribute
 * string the page's rows carry. */
export function areaIndexHtml(areas, attr = '') {
  const a = attr ? ` ${attr}` : '';
  return `<div class="area-index">${areasByCounty(areas).map((g) => {
    const id = `county-${slugify(g.county)}`;
    const rows = g.areas.map((x) => {
      const note = x.kind === 'county' ? 'County overview' : `${x.county}${x.rentControl ? ', rent control' : ''}`;
      return `<a href="${x.url}" class="area-row"${a}> <div${a}> <div class="area-name"${a}>${escapeHtml(x.name)}</div> <div class="area-note"${a}>${escapeHtml(note)}</div> </div> </a>`;
    }).join('');
    return `<section class="area-county-group" aria-labelledby="${id}"><h2 id="${id}" class="area-county-head">${escapeHtml(g.county)}</h2><div class="areas-list"${a}>${rows}</div></section>`;
  }).join('')}</div>`;
}

/** Drop the hand-written "other towns we serve" rows whose town now has its own page, so a town is
 * never listed twice once the OS publishes it. */
export function withoutPublishedTowns(html, areas) {
  const names = new Set(areas.map(({ data }) => data.name.trim().toLowerCase()));
  return html.replace(
    /<div class="area-row"[^>]*>\s*<div[^>]*>\s*<div class="area-name"[^>]*>([^<]*)<\/div>\s*<div class="area-note"[^>]*>[^<]*<\/div>\s*<\/div>\s*<\/div>/g,
    (row, name) => (names.has(name.trim().toLowerCase()) ? '' : row),
  );
}
