import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {studioSyncApi} from '../src/studio-sync-api.mjs';

test('Studio sync requires editor auth, allowed origin, reviewed plan, matching owner and explicit reset confirmation', async t => {
  const records = new Map(); let launches = 0, failLaunch = false;
  const doc = id => ({
    get: async () => ({data: () => records.get(id)}), create: async value => records.set(id, value),
    update: async value => records.set(id, {...records.get(id), ...value}),
  });
  const db = {collection: () => ({doc}), runTransaction: fn => fn({get: ref => ref.get(), update: (ref, value) => ref.update(value)})};
  const handler = studioSyncApi({db, authorize: async token => token === 'editor' ? 'owner' : token === 'other-editor' ? 'other' : null,
    origins: ['https://megvandeusen.sanity.studio'], allowance: async () => true, launch: async () => {if (failLaunch) throw new Error('Worker unavailable'); launches++;}});
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const post = (route, body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/studio/sync/${route}`, {
    method: 'POST', headers: {Origin: 'https://megvandeusen.sanity.studio', 'X-Sanity-Token': 'editor', 'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
  assert.equal((await post('plan', {mode: 'reset'}, {'X-Sanity-Token': 'reader-password'})).status, 403);
  assert.equal((await post('plan', {mode: 'reset'}, {Origin: 'https://evil.test'})).status, 403);
  assert.equal((await post('plan', {mode: 'write-production'})).status, 400);
  assert.equal(launches, 0);
  const response = await post('plan', {mode: 'reset'}); assert.equal(response.status, 202);
  const {id} = await response.json();
  assert.equal((await post('status', {id}, {'X-Sanity-Token': 'other-editor'})).status, 404);
  assert.equal((await post('apply', {id, confirmation: 'RESET STAGING'})).status, 503);
  records.set(id, {...records.get(id), status: 'review', plan: {conflicts: []}});
  assert.equal((await post('apply', {id, confirmation: 'yes'})).status, 400);
  assert.equal((await post('apply', {id, confirmation: 'RESET STAGING'})).status, 202);
  assert.equal(launches, 2);
  assert.equal((await post('apply', {id, confirmation: 'RESET STAGING'})).status, 503);
  assert.equal(launches, 2);
  failLaunch = true;
  assert.equal((await post('plan', {mode: 'update'})).status, 503);
  assert.equal([...records.values()].at(-1).status, 'failed', 'a launch failure must not leave an endless queued operation');
});
