import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:http';
import {syncSigner, syncVerifier, syncAuthorization, SYNC_BROKER_ORIGIN, SYNC_TARGET_ORIGIN} from '../src/sync-capability.mjs';
import {studioSyncBroker} from '../src/studio-sync-broker.mjs';

const keys = () => {
  const pair = generateKeyPairSync('ed25519');
  return {privateKey: pair.privateKey.export({type: 'pkcs8', format: 'der'}).toString('base64'),
    publicKey: pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64')};
};
const owner = 'a'.repeat(64), path = '/api/studio/sync/plan', body = JSON.stringify({mode: 'update'});

test('capabilities bind signature, editor, action and exact body; expire and are consumed only once', async () => {
  const pair = keys(), used = new Set(); let now = 1_000_000;
  const issue = syncSigner(pair.privateKey, () => now);
  const check = syncVerifier(pair.publicKey, async id => {if (used.has(id)) return false; used.add(id); return true;}, () => now);
  const token = issue(owner, path, body);
  assert.equal(await check(token, '/api/studio/sync/apply', body), null);
  assert.equal(await check(token, path, '{"mode":"reset"}'), null);
  assert.equal(await check(token + '.extra', path, body), null);
  assert.equal(await check(syncSigner(keys().privateKey, () => now)(owner, path, body), path, body), null);
  assert.equal(await check(token, path, body), owner);
  assert.equal(await check(token, path, body), null);
  const expired = issue(owner, path, body); now += 30_001;
  assert.equal(await check(expired, path, body), null);
  const future = issue(owner, path, body); now -= 10_000;
  assert.equal(await check(future, path, body), null);
  assert.throws(() => syncSigner(pair.publicKey));
  const unavailable = syncVerifier(pair.publicKey, async () => {throw new Error('storage unavailable');}, () => now);
  assert.equal(await unavailable(issue(owner, path, body), path, body), null);
});

test('staging does not fall back to production editor tokens or accept mixed authorization', async () => {
  const auth = syncAuthorization({editor: async token => token === 'staging-only' ? owner : null,
    capability: async token => token === 'signed-request' ? owner : null});
  const req = origin => ({headers: {origin}, url: path});
  assert.equal(await auth('production-editor', req('https://meg-website-staging.sanity.studio'), body), null);
  assert.equal(await auth('staging-only', req('https://meg-website-staging.sanity.studio'), body), owner);
  const broker = req(SYNC_BROKER_ORIGIN); broker.headers['x-sync-capability'] = 'signed-request';
  assert.equal(await auth('production-editor', broker, body), null);
  assert.equal(await auth(undefined, broker, body), owner);
  broker.headers.origin = 'https://meg-website-staging.sanity.studio';
  assert.equal(await auth('staging-only', broker, body), null);
});

test('production broker forwards only signed action permissions, never editor credentials; redirects fail closed', async t => {
  const pair = keys(), calls = [], used = new Set();
  const check = syncVerifier(pair.publicKey, async id => {if (used.has(id)) return false; used.add(id); return true;});
  let broken = false;
  const server = createServer(studioSyncBroker({authorize: async token => token === 'production-editor' ? owner : null,
    issue: syncSigner(pair.privateKey), allow: async () => true,
    request: async (url, options) => {
      calls.push({url, options});
      assert.equal(url, SYNC_TARGET_ORIGIN + path);
      assert.equal(options.redirect, 'error');
      assert(!JSON.stringify(options).includes('production-editor'));
      assert(!JSON.stringify(options).includes('private-cookie'));
      assert.deepEqual(Object.keys(options.headers).sort(), ['Content-Type', 'Origin', 'X-Sync-Capability']);
      assert.equal(await check(options.headers['X-Sync-Capability'], path, options.body), owner);
      if (broken) throw new Error('secret upstream error');
      return new Response(JSON.stringify({id: 'operation'}), {status: 202});
    }}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const post = (payload = body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: 'POST', headers: {Origin: 'https://megvandeusen.sanity.studio', 'Content-Type': 'application/json',
      'X-Sanity-Token': 'production-editor', Cookie: 'private-cookie', ...headers}, body: payload});
  assert.equal((await post(body, {Origin: 'https://evil.test'})).status, 403);
  assert.equal((await post(body, {'X-Sanity-Token': 'staging-editor'})).status, 403);
  assert.equal((await post('{"mode":"update","token":"secret"}')).status, 400);
  assert.equal((await post('x'.repeat(2049))).status, 413);
  assert.equal(calls.length, 0);
  assert.equal((await post()).status, 202);
  assert.equal(calls.length, 1);
  broken = true;
  const failure = await post(); assert.equal(failure.status, 503);
  assert(!(await failure.text()).includes('secret upstream error'));
});
