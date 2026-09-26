import assert from 'node:assert/strict';
import { inventory } from './legacy-redirects.mjs';

const endpoint = process.env.REDIRECT_TEST_ORIGIN || 'http://127.0.0.1:5581';
const parsedEndpoint = new URL(endpoint);
assert(parsedEndpoint.origin === endpoint && (
  endpoint === 'http://127.0.0.1:5581' ||
  (parsedEndpoint.protocol === 'https:' && /^megvandeusen-legacy-blog--[a-z0-9-]+\.web\.app$/.test(parsedEndpoint.hostname))
), 'Use the local emulator or the isolated legacy-blog preview');
const destination = 'https://megvandeusen-website--launch-review-ls5h4u6n.web.app';
let checked = 0;
for (const { from, to } of [...inventory.posts, ...inventory.pages]) {
  for (const path of from === '/' ? ['/'] : [from, from + '/']) {
    const response = await fetch(endpoint + path, { redirect: 'manual' });
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get('location'), destination + to, path);
    checked++;
    await response.body?.cancel();
  }
}
for (const path of ['/category/sleep/', '/tag/anxiety/page/2/', '/author/mvandeusen/', '/page/5/']) {
  const response = await fetch(endpoint + path, { redirect: 'manual' });
  assert.equal(response.status, 302, path);
  assert.equal(response.headers.get('location'), destination + '/blog', path);
  await response.body?.cancel();
  checked++;
}
for (const path of ['/this-post-never-existed', ...inventory.retired.map(item => item.from)]) {
  const missing = await fetch(endpoint + path, { redirect: 'manual' });
  assert.equal(missing.status, 404);
  const body = await missing.text();
  assert.match(body, /This page could not be found/);
  assert(body.includes(`href="${destination}/blog"`));
}
console.log(`Verified ${checked} real HTTP redirects and retired/unknown-URL notices at ${endpoint}.`);
