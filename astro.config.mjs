// @ts-check
import { defineConfig } from 'astro/config';
import { site } from './src/site.config.mjs';

// Static output on Vercel. URLs keep the trailing slash (vercel.json sets trailingSlash: true) and
// every page builds to <path>/index.html, exactly as the hand-built site was laid out.
export default defineConfig({
  site: site.baseUrl,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Keep markup as written: page bodies are the Phase 0 HTML, and whitespace between inline
  // elements is visible spacing.
  compressHTML: false,
  devToolbar: { enabled: false },
});
