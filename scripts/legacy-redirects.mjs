import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const inventory = JSON.parse(readFileSync(path.join(root, 'hosting/legacy-blog/redirects.json'), 'utf8'));

export function createLegacyConfig(destinationOrigin, { permanent = false, local = false } = {}) {
  assert(['https://megvandeusen.com', 'https://megvandeusen-website--launch-review-ls5h4u6n.web.app'].includes(destinationOrigin), 'Unexpected destination origin');
  if (permanent) assert.equal(inventory.unresolved.length, 0, 'Resolve the remaining legacy pages before enabling production redirects.');
  const entries = [...inventory.posts, ...inventory.pages];
  assert.equal(new Set(entries.map(item => item.from)).size, entries.length, 'Duplicate redirect path');
  const redirects = entries.map(({ from, to }) => {
    assert(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(from), `Unexpected legacy path: ${from}`);
    assert(to.startsWith('/') && !to.startsWith('//'), 'Destinations must be local paths');
    assert(existsSync(path.join(root, 'apps/web/dist', to, 'index.html')), `Build the destination first: ${to}`);
    return { regex: from === '/' ? '^/$' : `^${from}/?$`, destination: destinationOrigin + to, type: permanent ? 301 : 302 };
  });
  // These listings have no one-to-one archive equivalent. Preserve access to the complete blog index.
  redirects.push({ regex: '^/(page/[0-9]+|(?:category|tag|author)/[^/]+(?:/page/[0-9]+)?)/?$', destination: destinationOrigin + '/blog', type: permanent ? 301 : 302 });
  return {
    hosting: {
      // Generated configs live in .firebase/. A relative path works for both deployment and the emulator.
      site: 'megvandeusen-legacy-blog', public: permanent ? './legacy-production-public' : './legacy-preview-public',
      ignore: ['**/.*'], redirects,
      headers: [{ source: '**', headers: [
        { key: 'Cache-Control', value: permanent ? 'public, max-age=3600' : 'no-store' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        ...(!permanent ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : []),
      ] }],
    },
    ...(local ? { emulators: { hosting: { host: '127.0.0.1', port: 5581 }, ui: { enabled: false }, singleProjectMode: true } } : {}),
  };
}

export function prepareLegacyFiles(config, destinationOrigin) {
  const directory = path.resolve(root, '.firebase', config.hosting.public);
  mkdirSync(directory, { recursive: true });
  const notice = readFileSync(path.join(root, 'hosting/legacy-blog/public/404.html'), 'utf8');
  writeFileSync(path.join(directory, '404.html'), notice.replace('https://megvandeusen.com/blog', destinationOrigin + '/blog'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const permanent = process.argv.includes('--production');
  const config = createLegacyConfig(permanent ? 'https://megvandeusen.com' : 'https://megvandeusen-website--launch-review-ls5h4u6n.web.app', { permanent, local: process.argv.includes('--local') });
  mkdirSync(path.join(root, '.firebase'), { recursive: true });
  prepareLegacyFiles(config, permanent ? 'https://megvandeusen.com' : 'https://megvandeusen-website--launch-review-ls5h4u6n.web.app');
  const output = path.join(root, '.firebase', permanent ? 'legacy-production.json' : 'legacy-preview.json');
  writeFileSync(output, JSON.stringify(config, null, 2) + '\n');
  console.log(`Prepared ${config.hosting.redirects.length} redirect rules in ${output}. Nothing deployed; DNS unchanged.`);
}
