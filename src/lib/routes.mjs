// Every page route the site builds, worked out from source without running a build. Used by
// scripts/check-content.mjs and scripts/new-post.mjs (does a post's pillar or link target exist?)
// and scripts/build-redirects.mjs (does a redirect land on a page?). Routes have no leading or
// trailing slash; the home page is "".
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Repo-root directories that are never site pages (mirrored in scripts/postbuild.mjs).
export const NON_PAGE_ROOTS = new Set(['.git', '.astro', '.netlify', '.vercel', 'node_modules', 'dist', 'src', 'public', 'api', 'scripts', 'content', '_astro', 'images', 'styles', 'js']);

function walk(dir, visit, rel = '') {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, visit, rel ? `${rel}/${name}` : name);
    else visit(rel, name);
  }
}

/** Static pages under src/pages (one index.astro per directory). */
export function sourcePageRoutes(root) {
  const out = [];
  walk(join(root, 'src/pages'), (rel, name) => { if (name === 'index.astro' && !rel.includes('[')) out.push(rel); });
  return out;
}

export function postRoutes(root) {
  const dir = join(root, 'content/blog');
  return readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => String(JSON.parse(readFileSync(join(dir, f), 'utf8')).path || '').replace(/^\/+|\/+$/g, ''));
}

export function areaRoutes(root) {
  const dir = join(root, 'content/areas');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => `service-areas/${f.replace(/\.json$/, '')}`);
}

/** Pre-rendered pages committed at the repo root (the OS's "files" publish mode, until it moves to
 * content JSON). The build copies these through when no source route claims the same URL. */
export function legacyRootRoutes(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    if (NON_PAGE_ROOTS.has(name)) continue;
    const abs = join(root, name);
    if (name === 'index.html') { out.push(''); continue; }
    if (!statSync(abs).isDirectory()) continue;
    walk(abs, (rel, file) => { if (file === 'index.html') out.push(rel ? `${name}/${rel}` : name); });
  }
  return out;
}

export function siteRoutes(root) {
  return new Set([...sourcePageRoutes(root), ...postRoutes(root), ...areaRoutes(root), ...legacyRootRoutes(root)]);
}
