import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  // Set SITE_URL when the production domain is chosen; localhost has no canonical URL.
  site: process.env.SITE_URL || undefined,
  compressHTML: true,
  server: { host: '127.0.0.1' },
});
