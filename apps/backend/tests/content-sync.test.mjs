import test from 'node:test';
import assert from 'node:assert/strict';
import {planSync, contentHash, applySync, validateContent, assertSnapshot} from '../src/content-sync.mjs';
import {previewSessions, previewRedirect, PREVIEW_COOKIE, PREVIEW_TTL} from '../src/preview-session.mjs';

const doc = (id, title = id, extra = {}) => ({_id: id, _type: 'book', _rev: 'rev-' + id, title, ...extra});
test('ordinary update preserves experiments, excludes production drafts and stops on staging conflicts', () => {
  const source = [doc('a', 'new'), doc('b'), doc('drafts.secret')];
  const target = [doc('a', 'edited in staging'), doc('experiment')];
  const plan = planSync({source, target, mode: 'update'});
  assert.deepEqual(plan.add, ['b']);
  assert.deepEqual(plan.retained, ['experiment']);
  assert.equal(plan.conflicts[0].id, 'a');
  assert.deepEqual(plan.remove, []);
});
test('update uses baseline to distinguish production changes from staging changes', () => {
  const previous = doc('a', 'old');
  const baseline = {a: {source: contentHash(previous), target: contentHash(previous)}};
  const source = [doc('a', 'new')];
  assert.deepEqual(planSync({source, target: [previous], baseline, mode: 'update'}).update, ['a']);
  assert.equal(planSync({source, target: [doc('a', 'experiment')], baseline, mode: 'update'}).conflicts.length, 1);
  assert.equal(planSync({source, target: [previous, doc('drafts.a')], baseline, mode: 'update'}).conflicts.length, 1);
});
test('reset removes managed staging-only content and drafts, never system documents or assets', () => {
  const plan = planSync({source: [doc('a')], target: [doc('a', 'test'), doc('drafts.a'), doc('b'), {_id: 'asset', _type: 'sanity.imageAsset'}, {_id: 'session', _type: 'internal'}], mode: 'reset'});
  assert.deepEqual(plan.update, ['a']); assert.deepEqual(plan.remove, ['drafts.a', 'b']);
  assert.deepEqual(plan.conflicts, []);
});
test('a change after review invalidates the plan before any write', () => {
  const source = [doc('a')], target = [];
  const plan = planSync({source, target, mode: 'update'});
  assert.throws(() => assertSnapshot(plan, [doc('a', 'changed', {_rev: 'new'})], target), /changed after review/);
  assert.throws(() => assertSnapshot(plan, source, [doc('test')]), /changed after review/);
});
test('assets, schema and audio validation finish before content becomes visible; backups precede copying', async () => {
  const source = [doc('a')]; let target = []; const events = [];
  const plan = planSync({source, target, mode: 'update'});
  const adapter = {readSource: async () => source, readTarget: async () => target,
    backup: async () => events.push('backup'), copyDocument: async value => {events.push('copy'); return value;},
    targetAssets: async () => [], validateSchema: async () => events.push('validate'),
    commit: async ({replacements}) => {events.push('commit'); target = replacements.map(doc => ({...doc, _rev: 'new'}));},
    saveBaseline: async baseline => {events.push('baseline'); assert.equal(baseline.a.target, contentHash(target[0]));}};
  assert.deepEqual(await applySync({plan, snapshot: source, adapter}), {copied: 1, removed: 0});
  assert.deepEqual(events, ['backup', 'copy', 'validate', 'commit', 'baseline']);
});
test('failed audio copy or schema validation cannot mutate staging content', async () => {
  for (const failAt of ['copyDocument', 'validateSchema']) {
    const source = [doc('a')], target = []; let writes = 0;
    const adapter = {readSource: async () => source, readTarget: async () => target, backup: async () => {},
      copyDocument: async value => value, targetAssets: async () => [], validateSchema: async () => {}, commit: async () => writes++};
    adapter[failAt] = async () => {throw new Error('injected failure');};
    await assert.rejects(applySync({plan: planSync({source, target, mode: 'reset'}), snapshot: source, adapter}), /injected failure/);
    assert.equal(writes, 0);
  }
});
test('content validation rejects dangling references and duplicate slugs', () => {
  assert.throws(() => validateContent([doc('a', 'Book', {cover: {asset: {_type: 'reference', _ref: 'missing'}}})]), /Missing referenced/);
  const post = {_type: 'blogPost', slug: {current: 'same'}};
  assert.throws(() => validateContent([doc('a', 'A', post), doc('b', 'B', post)]), /Duplicate/);
  assert.throws(() => planSync({source: [], target: [doc('versions.release.a')], mode: 'reset'}), /content-release/);
});
test('preview cookies are bound to environment, expire and reject forgery', () => {
  let now = 10000;
  const secret = 'x'.repeat(48);
  const sessions = previewSessions(secret, 'staging', () => now);
  const value = sessions.issue(); const cookie = PREVIEW_COOKIE + '=' + value;
  assert.equal(sessions.verify(cookie), true);
  assert.equal(sessions.verify(cookie + 'x'), false);
  assert.equal(previewSessions(secret, 'production', () => now).verify(cookie), false);
  assert.equal(sessions.verify('resources-session=' + value), false);
  now += PREVIEW_TTL;
  assert.equal(sessions.verify(cookie), false);
});
test('preview handoff cannot redirect off-site or into API endpoints', () => {
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/api/preview/enable', '/\n/evil.test']) assert.equal(previewRedirect(path), '/');
  assert.equal(previewRedirect('/blog/a?preview=1'), '/blog/a?preview=1');
});
