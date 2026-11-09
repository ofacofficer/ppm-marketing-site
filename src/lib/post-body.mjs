// The post body as published: the content JSON's `body` plus the standard mid-article CTA and the
// closing line. Shared by the Astro post route (src/pages/[...post].astro) and the legacy renderer
// scripts/new-post.mjs, and mirrored by the OS's website-publish function, so all three produce the
// same article. Change it here, not in a copy.

export const MID_CTA = '<div class="blog-mid-cta">\n<p>Tired of managing this yourself? PPM handles it all — one management fee, no hidden fees.</p>\n<a href="/contact/" class="btn btn-gold" style="font-size:13px;">Get a free rental analysis</a>\n</div>\n';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const REQUIRED_FIELDS = ['path', 'title', 'description', 'pillar', 'author', 'authorType', 'datePublished', 'body'];

/** Honor an explicit <!--MID_CTA--> marker, else insert the CTA before the third h2 of a long post;
 * end with the standard closing line unless the post already closes itself. */
export function postBodyHtml(body) {
  let out = body;
  if (out.includes('<!--MID_CTA-->')) {
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
