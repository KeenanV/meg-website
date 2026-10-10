import { defineConfig } from 'astro/config';
import resourcesLocal from './integrations/resources-local.mjs';
import node from '@astrojs/node';

const editorial = process.env.EDITORIAL_PREVIEW === 'true';

export default defineConfig({
  output: editorial ? 'server' : 'static',
  adapter: editorial ? node({mode: 'middleware'}) : undefined,
  outDir: editorial ? './dist-preview' : './dist',
  integrations: editorial ? [] : [resourcesLocal()],
  vite: {
    define: {'import.meta.env.EDITORIAL_PREVIEW': JSON.stringify(editorial)},
    server: {fs: {deny: ['**/.private/**', '**/.env*', '**/*.{crt,pem}', '**/.git/**']}},
  },
  // Set SITE_URL when the production domain is chosen; localhost has no canonical URL.
  site: process.env.SITE_URL || undefined,
  compressHTML: true,
  server: { host: '127.0.0.1' },
});
