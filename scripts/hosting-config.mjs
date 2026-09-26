import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// All generated configs are written under .firebase/.
export function createWebsiteConfig(channel = 'preview') {
  assert(['preview', 'live'].includes(channel), 'HOSTING_RELEASE_CHANNEL must be preview or live');
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  // The CLI checks this against the repository root even when --config is in .firebase/.
  config.hosting.public = fileURLToPath(new URL('../apps/web/dist', import.meta.url));
  delete config.emulators;
  if (channel === 'preview') {
    config.hosting.headers.push({
      source: '**', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    });
  }
  return config;
}
