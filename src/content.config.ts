// Content collections. The blog collection reads content/blog/*.json in the schema the OS's
// website-publish function and scripts/new-post.mjs already write; that schema is unchanged.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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
    datePublished: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    body: z.string(),
  }),
});

// Per-post additions that live outside the post's own JSON, keyed by the same file name, so a
// republish from the OS (which rewrites content/blog/<slug>.json) can never drop them.
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

const areas = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/areas' }),
});

export const collections = { blog, blogExtras, areas };
