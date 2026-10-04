import { defineConfig } from 'astro/config';
import resourcesLocal from './integrations/resources-local.mjs';

export default defineConfig({
  output: 'static',
  integrations: [resourcesLocal()],
  vite: {server: {fs: {deny: ['**/.private/**', '**/.env*', '**/*.{crt,pem}', '**/.git/**']}}},
  // Set SITE_URL when the production domain is chosen; localhost has no canonical URL.
  site: process.env.SITE_URL || undefined,
  compressHTML: true,
  server: { host: '127.0.0.1' },
});
