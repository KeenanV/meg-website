import test from 'node:test';
import assert from 'node:assert/strict';
import {claimSync, queuedPhase} from '../src/sync-queue.mjs';
import {cloudSyncLauncher} from '../src/studio-sync-api.mjs';

const now = 1_800_000_000_000;
const base = {owner: 'editor', mode: 'update', created: now - 1000, status: 'queued'};
test('worker rejects stale, future, unapproved and replayed requests', () => {
  assert.equal(queuedPhase(base, now), 'plan');
  const approved = {...base, status: 'queued-apply', approvedBy: 'editor', approvedAt: now, plan: {conflicts: []}};
  assert.equal(queuedPhase(approved, now), 'apply');
  for (const value of [null, {...base, created: now + 1}, {...base, created: now - 3_600_001},
    {...base, mode: 'production'}, {...approved, approvedBy: 'other'}, {...approved, approvedAt: undefined},
    {...approved, plan: {conflicts: [{}]}}, {...approved, status: 'applying'}, {...approved, status: 'complete'}]) {
    assert.equal(queuedPhase(value, now), null);
  }
});

test('atomic queue claim permits one worker and respects deployment/maintenance locks', async () => {
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const records = new Map([[id, {...base}]]);
  let lock = {}, tail = Promise.resolve();
  const db = {collection: name => ({doc: id => ({name, id}), where: () => ({limit: () => ({query: true})})}),
    runTransaction(fn) {
      const task = tail.then(() => fn({
        get: async ref => ref.query ? {docs: [...records].filter(([, r]) => ['queued', 'queued-apply'].includes(r.status))
          .map(([id, r]) => ({id, ref: {id}, data: () => r}))} : {data: () => lock},
        set: (_ref, data) => {lock = data;},
        update: (ref, patch) => records.set(ref.id, {...records.get(ref.id), ...patch}),
      }));
      tail = task.catch(() => {}); return task;
    }};
  lock = {expires: now + 100};
  assert.equal(await claimSync(db, () => now), null);
  lock = {maintenance: true, expires: 0};
  assert.equal(await claimSync(db, () => now), null);
  lock = {};
  const claims = await Promise.all([claimSync(db, () => now), claimSync(db, () => now)]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(records.get(id).status, 'planning');
  lock = {};
  records.set(id, {...base, status: 'queued-apply'});
  assert.equal(await claimSync(db, () => now), null);
  assert.equal(records.get(id).status, 'failed');
});

test('gateway launches only the fixed job with no argument or environment overrides', async () => {
  let request;
  const launch = cloudSyncLauncher({getClient: async () => ({request: async value => {request = value;}})});
  await launch('ignored-id', 'ignored-phase');
  assert.deepEqual(request.data, {});
  assert.equal(request.method, 'POST');
  assert.match(request.url, /projects\/megvandeusen-staging\/locations\/us-west1\/jobs\/studio-content-sync:run$/);
});
