import { defineConfig } from 'astro/config';

import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',

  // update when you have your domain
  site: 'https://example.com',

  integrations: [tailwind()]
});