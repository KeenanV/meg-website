import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLegacyConfig, inventory } from '../scripts/legacy-redirects.mjs';

const origin = 'https://megvandeusen-website--launch-review-ls5h4u6n.web.app';
test('every inventoried article redirects directly to an existing imported post, with or without trailing slash', () => {
  const config = createLegacyConfig(origin);
  assert.equal(inventory.posts.length, 46);
  const destinations = new Set();
  for (const { from, to } of inventory.posts) {
    destinations.add(to);
    for (const requestPath of [from, from + '/']) {
      const match = config.hosting.redirects.find(rule => new RegExp(rule.regex).test(requestPath));
      assert.equal(match?.destination, origin + to, requestPath);
      assert.equal(match.type, 302, 'Preview redirects must not be cached as permanent moves');
    }
  }
  assert.equal(destinations.size, 46, 'Every old post must retain its own destination');
});

test('known pages and archives work; unrelated missing URLs do not silently redirect', () => {
  const rules = createLegacyConfig(origin).hosting.redirects;
  const destination = url => rules.find(rule => new RegExp(rule.regex).test(url))?.destination;
  assert.equal(destination('/'), origin + '/blog');
  assert.equal(destination('/media/'), origin + '/news');
  assert.equal(destination('/about-clinical-psychologist-meg-van-deusen/'), origin + '/about');
  assert.equal(destination('/tag/sleep/page/2/'), origin + '/blog');
  assert.equal(destination('/page/5/'), origin + '/blog');
  assert.equal(destination('/not-a-real-post'), undefined);
  assert.equal(destination('/wp-admin/'), undefined);
});

test('production redirects are permanent and retired pages keep the explicit not-found notice', () => {
  const rules = createLegacyConfig('https://megvandeusen.com', { permanent: true }).hosting.redirects;
  assert(rules.every(rule => rule.type === 301 && rule.destination.startsWith('https://megvandeusen.com/')));
  for (const { from } of inventory.retired) assert(!rules.some(rule => new RegExp(rule.regex).test(from)));
  assert.throws(() => createLegacyConfig('https://attacker.example'), /Unexpected destination/);
});
