import test from 'node:test';
import assert from 'node:assert/strict';
import {redeemPreviewSecret, handoffScript, handoffHtml} from '../src/preview-handoff.mjs';
import {firestoreDeliveries} from '../src/webhook-deliveries.mjs';

function database() {
  const records = new Map(); let tail = Promise.resolve();
  const doc = id => ({id, async create(value) {if (records.has(id)) throw Object.assign(new Error('Duplicate'), {code: 6}); records.set(id,value);}});
  return {records, collection: name => ({doc: id => doc(name + '/' + id)}), runTransaction(fn) {
    const task = tail.then(() => fn({get: async ref => ({data: () => records.get(ref.id)}),
      set: (ref, value) => records.set(ref.id, value), delete: ref => records.delete(ref.id),
      update: (ref, value) => records.set(ref.id, {...records.get(ref.id), ...value})}));
    tail = task.catch(() => {}); return task;
  }};
}
test('preview handoff is redeemed once across processes; stores only a digest, fails closed on outage', async () => {
  const records = new Map();
  const db = {file: id => ({save: async (value, options) => {
    assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
    if (records.has(id)) throw Object.assign(new Error('Exists'), {code: 412}); records.set(id, value);
  }})};
  const secret = 'test-preview-secret-with-enough-entropy';
  const results = await Promise.all([redeemPreviewSecret(db, 'staging', secret), redeemPreviewSecret(db, 'staging', secret)]);
  assert.deepEqual(results, [true, false]);
  assert.equal(JSON.stringify([...records]).includes(secret), false);
  assert.ok(handoffScript.indexOf('history.replaceState') < handoffScript.indexOf('fetch('));
  assert.ok(!handoffHtml.includes(secret));
  await assert.rejects(redeemPreviewSecret({file() {throw new Error('Outage');}}, 'staging', secret));
});
test('webhook delivery claims survive fresh instances, exclude concurrency and allow failed/expired leases to retry', async () => {
  const db = database(); let now = 100000;
  const a = firestoreDeliveries(db, () => now), b = firestoreDeliveries(db, () => now);
  const owner = await a.claim('event');
  assert.equal(await b.claim('event'), 'busy');
  await a.release('event', owner);
  const retry = await b.claim('event');
  await b.complete('event', retry);
  assert.equal(await firestoreDeliveries(db, () => now).claim('event'), 'complete');
  const expiredOwner = await a.claim('crash'); now += 31000;
  const newOwner = await b.claim('crash');
  assert.notEqual(expiredOwner, newOwner);
  await a.release('crash', expiredOwner);
  assert.equal(await a.claim('crash'), 'busy');
});
