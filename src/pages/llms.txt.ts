// /llms.txt: the site summary for language models. The hand-written sections (who we are,
// services, legal, notes) live in src/data/llms.txt; the {{AREAS}} and {{POSTS}} markers are filled
// at build time from content/areas and content/blog (plus the hand-built posts), so every page the OS
// publishes is listed with no hand edit.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import template from '../data/llms.txt?raw';
import { site } from '../site.config.mjs';
import { postEntries, areasByCounty } from '../lib/content-index.mjs';

const line = (title: string, path: string, text: string) => `- [${title}](${site.baseUrl}${path}): ${text}`;

export const GET: APIRoute = async () => {
  const areas = (await getCollection('areas')).map((a) => ({ slug: a.id, data: a.data }));
  const areaLines = areasByCounty(areas).flatMap((g) => g.areas.map((a) => line(a.kind === 'county' ? a.name : `${a.name}, NJ (${a.county})`, a.url, a.seo.description)));

  const entries = postEntries((await getCollection('blog')).map((p) => p.data));
  const pillars = new Map<string, typeof entries>();
  for (const e of entries) pillars.set(e.pillarPath, [...(pillars.get(e.pillarPath) ?? []), e]);
  const postBlocks = [...pillars.values()]
    .sort((a, b) => a[0].pillarName.localeCompare(b[0].pillarName))
    .map((list) => [`### ${list[0].pillarName}`, ...list.map((e) => line(e.title, e.url, e.description))].join('\n'));

  for (const marker of ['{{AREAS}}', '{{POSTS}}']) if (!template.includes(marker)) throw new Error(`src/data/llms.txt has no ${marker} marker`);
  const body = template.replace('{{AREAS}}', areaLines.join('\n')).replace('{{POSTS}}', postBlocks.join('\n\n'));
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
