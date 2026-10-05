import assert from 'node:assert/strict';
const base = 'https://staging.megvandeusen.com';
const credentials = JSON.parse(process.env.STAGING_REVIEWER || '{}');
if (!credentials.username || !credentials.password) throw new Error('Staging test credentials are missing');
const authorization = 'Basic '+Buffer.from(credentials.username+':'+credentials.password).toString('base64');
async function request(path, options = {}) {
  return fetch(base+path, {redirect: 'manual', signal: AbortSignal.timeout(45_000), ...options});
}
for (const path of ['/', '/resources', '/api/resources/catalog', '/_astro/not-found.js']) {
  const response = await request(path);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  await response.body?.cancel();
}
const headers = {Authorization: authorization};
const home = await request('/', {headers});
assert.equal(home.status, 200);
assert.match(await home.text(), /Private test environment/);
assert.equal((await request('/api/resources/catalog', {headers})).status, 401);
const challenge = await request('/api/resources/challenge', {headers});
assert.equal(challenge.status, 200);
const cookie = challenge.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('__session=p.'));
const login = await request('/api/resources/login', {method: 'POST', headers: {...headers, Cookie: cookie, Origin: base, 'Content-Type': 'application/json'}, body: JSON.stringify({password: 'deliberate-negative-test'})});
assert.equal(login.status, 400);
assert.equal((await request('/api/resources/catalog', {headers: {...headers, Cookie: cookie}})).status, 401);
const hook = await request('/sanity-hook', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
assert.equal(hook.status, 401);
console.log('Staging TLS, reviewer gate, noindex and reader CAPTCHA enforcement passed. Human playback testing remains required.');
