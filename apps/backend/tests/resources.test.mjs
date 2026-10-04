import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createResourcesHandler, passwordRecord} from '../src/resources.mjs';
const credentials = await passwordRecord('book-fixture-password');
const id = 'a'.repeat(64);
const origin = 'https://reader.example';
const bytes = Buffer.from('0123456789');
async function setup(t, overrides = {}) {
  let time = Date.now();
  let reads = 0;
  const handler = createResourcesHandler({credentials, allowOrigin: value => value === origin, now: () => time,
    store: {catalog: async () => [{id, title: 'Private practice', audioUrl: `/api/resources/audio/${id}`}],
      asset: async () => { reads++; return {size: bytes.length, send: async (res, {start, end}) => res.end(bytes.subarray(start, end + 1))}; }}, ...overrides});
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/resources`;
  const request = (path, options = {}) => fetch(url + path, options);
  const post = (path, body, headers = {}) => request(path, {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
  const login = async () => {
    const response = await post('/login', {password: 'book-fixture-password'});
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return {request, post, login, reads: () => reads, advance: ms => { time += ms; }};
}

test('catalog, audio, image and HEAD fail closed before authentication without opening files', async t => {
  const {request, reads} = await setup(t);
  for (const path of ['/catalog', `/audio/${id}`, `/image/${id}`]) {
    for (const method of ['GET', 'HEAD']) assert.equal((await request(path, {method})).status, 401);
  }
  assert.equal(reads(), 0);
});

test('wrong password and forged cookies fail; successful login sets an opaque protected cookie', async t => {
  const {request, post, login} = await setup(t);
  assert.equal((await post('/login', {password: 'wrong'})).status, 401);
  assert.equal((await request('/catalog', {headers: {Cookie: '__session=' + 'f'.repeat(64)}})).status, 401);
  const response = await post('/login', {password: 'book-fixture-password'});
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /^__session=[a-f0-9]{64}; Path=\/api\/resources;/);
  assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  assert.doesNotMatch(setCookie, /book-fixture-password/);
  const cookie = await login();
  const catalog = await request('/catalog', {headers: {Cookie: cookie}});
  assert.equal(catalog.status, 200);
  assert.match(catalog.headers.get('cache-control'), /no-store/);
  assert.equal((await catalog.json()).items[0].title, 'Private practice');
});

test('audio supports full, partial, suffix, HEAD and invalid ranges only after authentication', async t => {
  const {request, login} = await setup(t);
  const cookie = await login();
  const full = await request(`/audio/${id}`, {headers: {Cookie: cookie}});
  assert.equal(await full.text(), '0123456789');
  for (const [range, status, text, contentRange] of [['bytes=2-5', 206, '2345', 'bytes 2-5/10'], ['bytes=-3', 206, '789', 'bytes 7-9/10'], ['bytes=8-100', 206, '89', 'bytes 8-9/10']]) {
    const res = await request(`/audio/${id}`, {headers: {Cookie: cookie, Range: range}});
    assert.equal(res.status, status); assert.equal(await res.text(), text); assert.equal(res.headers.get('content-range'), contentRange);
  }
  for (const range of ['bytes=20-', 'bytes=8-2', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=-', 'bytes=999999999999999999999-']) {
    assert.equal((await request(`/audio/${id}`, {headers: {Cookie: cookie, Range: range}})).status, 416);
  }
  const head = await request(`/audio/${id}`, {method: 'HEAD', headers: {Cookie: cookie}});
  assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '');
});

test('logout revokes copied cookies; reauthentication rotates sessions; expiry rejects new ranges', async t => {
  const {request, post, login, advance} = await setup(t);
  const cookie = await login();
  const next = await post('/login', {password: 'book-fixture-password'}, {Cookie: cookie});
  assert.equal(next.status, 200);
  assert.equal((await request('/catalog', {headers: {Cookie: cookie}})).status, 401);
  const nextCookie = next.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/logout', {}, {Cookie: nextCookie})).status, 200);
  assert.equal((await request(`/audio/${id}`, {headers: {Cookie: nextCookie}})).status, 401);
  const expires = await login();
  advance(8 * 60 * 60 * 1000 + 1);
  assert.equal((await request(`/audio/${id}`, {headers: {Cookie: expires, Range: 'bytes=1-'}})).status, 401);
});

test('cross-origin login/logout/asset requests and untrusted paths are rejected', async t => {
  const {request, post, login} = await setup(t);
  const cookie = await login();
  assert.equal((await post('/login', {password: 'book-fixture-password'}, {Origin: 'https://attacker.example'})).status, 403);
  assert.equal((await post('/logout', {}, {Cookie: cookie, Origin: 'https://attacker.example'})).status, 403);
  assert.equal((await request(`/audio/${id}`, {headers: {Cookie: cookie, 'Sec-Fetch-Site': 'cross-site'}})).status, 403);
  assert.equal((await request('/audio/%2e%2e%2fpassword.json', {headers: {Cookie: cookie}})).status, 404);
  assert.equal((await request('/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).status, 403);
  assert.equal((await request('/catalog', {headers: {Cookie: cookie}})).status, 200);
});

test('login brute-force limit ignores spoofed forwarding headers and recovers after cooldown', async t => {
  const {post, advance} = await setup(t);
  for (let i = 0; i < 10; i++) assert.equal((await post('/login', {password: 'wrong'}, {'X-Forwarded-For': `1.2.3.${i}`})).status, 401);
  assert.equal((await post('/login', {password: 'book-fixture-password'})).status, 429);
  advance(15 * 60_000 + 1);
  assert.equal((await post('/login', {password: 'book-fixture-password'})).status, 200);
});

test('oversized requests and missing configuration fail safely', async t => {
  const {post} = await setup(t);
  assert.equal((await post('/login', {password: 'a'.repeat(3000)})).status, 413);
  const missing = await setup(t, {credentials: undefined});
  assert.equal((await missing.request('/catalog')).status, 503);
});

test('cloud media links are issued only after authentication and HEAD does not issue a link', async t => {
  let issued = 0;
  const {request, login, post} = await setup(t, {store: {
    catalog: async () => [],
    asset: async () => ({size: 10, redirect: async () => {issued++; return 'https://storage.example/private-signed-fixture';}}),
  }});
  const route = `/audio/${id}`;
  assert.equal((await request(route, {redirect: 'manual'})).status, 401);
  const cookie = await login();
  const head = await request(route, {method: 'HEAD', headers: {Cookie: cookie}});
  assert.equal(head.status, 200); assert.equal(issued, 0);
  const response = await request(route, {redirect: 'manual', headers: {Cookie: cookie, Range: 'bytes=0-4'}});
  assert.equal(response.status, 302); assert.equal(issued, 1);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('content-range'), null);
  await post('/logout', {}, {Cookie: cookie});
  assert.equal((await request(route, {redirect: 'manual', headers: {Cookie: cookie}})).status, 401);
  assert.equal(issued, 1);
});
