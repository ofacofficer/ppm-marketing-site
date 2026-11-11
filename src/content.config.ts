// Content collections. The blog collection reads content/blog/*.json in the schema the OS's
// website-publish function and scripts/new-post.mjs write; the areas collection reads
// content/areas/*.json. docs/CONTENT_SCHEMA.md is the written contract for both, including the
// optional fields below. Every field added since the original schema is optional, so a file written
// to the original schema still validates and renders as before. Rules zod cannot express (dates not
// in the future, dateModified >= datePublished, a FAQ in only one place, county towns that exist)
// live in src/lib/site-guard.mjs and run before every build (scripts/check-content.mjs).
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const httpsUrl = z.string().regex(/^https:\/\/[^\s"<>]+$/, 'must be an https:// URL');
const faq = z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).min(1);
const link = z.object({ href: z.string(), label: z.string() });

const blog = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/blog' }),
  schema: z.object({
    path: z.string(),
    title: z.string(),
    titleTag: z.string().optional(),
    description: z.string().max(165),
    pillar: z.object({ name: z.string(), path: z.string() }),
    author: z.string(),
    authorType: z.enum(['Organization', 'Person']),
    datePublished: isoDate,
    body: z.string(),
    // Optional (docs/CONTENT_SCHEMA.md).
    /** Last substantive edit; shown as "Updated <date>", BlogPosting dateModified, sitemap lastmod. */
    dateModified: isoDate.optional(),
    /** The search phrase the post targets. Recorded for the OS's SEO tracking; not rendered. */
    primaryKeyword: z.string().optional(),
    /** Who the post is for: owner posts carry the owner CTAs, tenant posts the rentals/tenant links. */
    audience: z.enum(['owner', 'tenant']).default('owner'),
    /** FAQPage JSON-LD, plus a visible FAQ for any question the body does not already show. */
    faq: faq.optional(),
    /** Rendered as a "Sources" list at the end of the article; the only place external links go. */
    sources: z.array(z.object({ title: z.string().min(1), url: httpsUrl })).min(1).optional(),
    /** The "general information, not legal advice" line. Default: true for NJ Landlord Law posts. */
    legalDisclaimer: z.boolean().optional(),
  }),
});

// Per-post additions that live outside the post's own JSON, keyed by the same file name. Still
// honored; a post may now carry faq and legalDisclaimer in its own JSON instead (a FAQ in both
// places fails the content check).
const blogExtras = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/blog-extras' }),
  schema: z.object({
    /** og:title / twitter:title when they should differ from the <title>. */
    socialTitle: z.string().optional(),
    /** FAQPage JSON-LD; the same questions must appear in the post body. */
    faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
    /** The "general information, not legal advice" line under the article. */
    legalDisclaimer: z.boolean().optional(),
  }),
});

// A service-area page, /service-areas/<file name>/: a town (the default) or a county.
const areas = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/areas' }),
  schema: z.object({
    kind: z.enum(['town', 'county']).default('town'),
    name: z.string().min(1),
    /** The county the page is in; a county page names itself ("Hudson County"). */
    county: z.string().min(1),
    /** True when the town has a municipal rent control ordinance. Not used on a county page. */
    rentControl: z.boolean(),
    seo: z.object({
      title: z.string(),
      description: z.string(),
      social: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
      twitter: z.object({ site: z.boolean().optional(), title: z.string().optional(), description: z.string().optional() }).optional(),
    }),
    h1: z.string(),
    intro: z.string(),
    /** Hero photo: public/images/service-areas/<image>-hero.jpg, -hero.webp and -hero-768.webp. */
    hero: z.object({
      image: z.string(), webpWidth: z.number(), width: z.number(), height: z.number(), alt: z.string(),
      creditHtml: z.string().optional(),
    }).optional(),
    breadcrumbHubLabel: z.string(),
    contentHtml: z.string(),
    sidebar: z.object({ ctaText: z.string(), nearbyLabel: z.string(), nearby: z.array(link), guides: z.array(link) }),
    cta: z.object({ heading: z.string(), text: z.string() }),
    // Optional (docs/CONTENT_SCHEMA.md).
    /** County pages: the area slugs of its town pages, rendered as a linked list. Each must exist. */
    towns: z.array(z.string()).optional(),
    faq: faq.optional(),
    /** "Local rules at a glance": one cited fact per entry. */
    localFacts: z.array(z.object({ label: z.string().min(1), text: z.string().min(1), sourceTitle: z.string().min(1), sourceUrl: httpsUrl })).min(1).optional(),
    datePublished: isoDate.optional(),
    dateModified: isoDate.optional(),
  }),
});

export const collections = { blog, blogExtras, areas };
