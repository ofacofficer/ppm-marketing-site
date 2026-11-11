// The post body as published: the content JSON's `body` plus the standard mid-article CTA and the
// closing line. Shared by the Astro post route (src/pages/[...post].astro) and the legacy renderer
// scripts/new-post.mjs, and mirrored by the OS's website-publish function, so all three produce the
// same article. Change it here, not in a copy.

export const MID_CTA = '<div class="blog-mid-cta">\n<p>Tired of managing this yourself? PPM handles it all — one management fee, no hidden fees.</p>\n<a href="/contact/" class="btn btn-gold" style="font-size:13px;">Get a free rental analysis</a>\n</div>\n';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const REQUIRED_FIELDS = ['path', 'title', 'description', 'pillar', 'author', 'authorType', 'datePublished', 'body'];

/** Honor an explicit <!--MID_CTA--> marker, else insert the CTA before the third h2 of a long post;
 * end with the standard closing line unless the post already closes itself. The CTA is the owner
 * pitch, so a tenant post (audience "tenant") never gets it: its marker is dropped. */
export function postBodyHtml(body, { audience = 'owner' } = {}) {
  let out = body;
  if (audience === 'tenant') {
    out = out.split('<!--MID_CTA-->').join('');
  } else if (out.includes('<!--MID_CTA-->')) {
    out = out.replace('<!--MID_CTA-->', MID_CTA);
  } else {
    const h2s = [...out.matchAll(/<h2[\s>]/g)];
    if (h2s.length >= 4) {
      const at = h2s[2].index;
      out = out.slice(0, at) + MID_CTA + out.slice(at);
    }
  }
  if (!/Get in touch|<hr>/.test(out.slice(-400))) {
    out += '\n<hr>\n<p><em>Proactive Property Management handles this for every property under management. Questions about your NJ rental? <a href="/contact/">Get in touch</a>.</em></p>';
  }
  return out;
}

const H2 = /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g;
const headingSlug = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&[a-z0-9#]+;/gi, ' ').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'section';

/** Give every h2 an id (kept when it has one; else a slug of its text, made unique), so the table
 * of contents can link to it. Deterministic: the same body always gets the same ids. */
export function withHeadingIds(html) {
  const taken = new Set([...String(html).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  return String(html).replace(H2, (whole, attrs = '', inner) => {
    if (/\sid="/.test(attrs)) return whole;
    let id = headingSlug(inner);
    for (let n = 2; taken.has(id); n++) id = `${headingSlug(inner)}-${n}`;
    taken.add(id);
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });
}

/** The h2s of a body (after withHeadingIds) as { id, html } for the table of contents. The label
 * keeps the heading's entities and drops its inline tags. */
export function headings(html) {
  return [...String(html).matchAll(H2)].map(([, attrs = '', inner]) => ({
    id: (attrs.match(/\sid="([^"]+)"/) || [])[1],
    html: inner.replace(/<[^>]+>/g, '').trim(),
  })).filter((h) => h.id && h.html);
}

/** Plain text of some HTML, for comparing a FAQ question with the body copy. */
export function plainText(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;|&lsquo;|[\u2018\u2019]/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** "2026-07-11" → { label: "Published July 2026", human: "July 11, 2026" } */
export function postDates(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { label: `Published ${MONTHS[m - 1]} ${y}`, human: `${MONTHS[m - 1]} ${d}, ${y}` };
}

/** The BlogPosting and BreadcrumbList JSON-LD every post carries. */
export function postJsonLd(c, base) {
  const url = `${base}/${trim(c.path)}/`;
  const pillarPath = `/${trim(c.pillar.path)}/`;
  return {
    url,
    pillarPath,
    posting: {
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: c.title, description: c.description,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      image: `${base}/og-image.jpg`,
      publisher: { '@type': 'Organization', name: 'Proactive Property Management',
        logo: { '@type': 'ImageObject', url: `${base}/images/logo-white-horizontal.png` } },
      author: { '@type': c.authorType, name: c.author },
      datePublished: c.datePublished,
      dateModified: c.dateModified || c.datePublished,
    },
    breadcrumb: {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: 'Resources', item: `${base}/blog/` },
        { '@type': 'ListItem', position: 3, name: c.pillar.name, item: `${base}${pillarPath}` },
        { '@type': 'ListItem', position: 4, name: c.title, item: url },
      ],
    },
  };
}

export const trim = (p) => String(p).replace(/^\/+|\/+$/g, '');
