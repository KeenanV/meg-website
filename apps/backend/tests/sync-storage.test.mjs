import test from 'node:test';
import assert from 'node:assert/strict';
import {syncStorage} from '../src/sync-storage.mjs';
import {planSync, contentHash} from '../src/content-sync.mjs';

test('cross-project sync reads production anonymously and remaps uploaded image references', async () => {
  const source = {_id: 'book-a', _type: 'book', title: 'Book', cover: {asset: {_type: 'reference', _ref: 'image-original-100x100-png'}}};
  const asset = {_id: source.cover.asset._ref, _type: 'sanity.imageAsset', mimeType: 'image/png', url: 'https://cdn.sanity.io/images/ap0mc9ri/production/original-100x100.png'};
  const requests = [];
  const adapter = syncStorage({id: '00000000-0000-4000-8000-000000000001', targetToken: 'staging-only-fixture', db: {}, storage: {bucket: () => ({})},
    fetch: async (input, options) => {
      const url = new URL(input); requests.push({url, options});
      if (url.hostname === 'ap0mc9ri.api.sanity.io') {
        assert.equal(url.searchParams.get('perspective'), 'published');
        assert.equal(options.headers.Authorization, undefined);
        return Response.json({result: [source, asset]});
      }
      if (url.hostname === 'cdn.sanity.io') {
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(url.searchParams.get('dlRaw'), null);
        return new Response('public image bytes');
      }
      assert.equal(url.hostname, '77uvsyo1.api.sanity.io');
      assert.equal(options.headers.Authorization, 'Bearer staging-only-fixture');
      return Response.json({document: {_id: 'image-reencoded-100x100-png'}});
    }});
  await adapter.readSource();
  const target = await adapter.copyDocument(structuredClone(source));
  assert.equal(target.cover.asset._ref, 'image-reencoded-100x100-png');
  await adapter.copyDocument(structuredClone(source));
  assert.equal(requests.filter(({options}) => options.method === 'POST').length, 1);
  const baseline = {[source._id]: {source: contentHash(source), target: contentHash(target)}};
  const plan = planSync({source: [source], target: [target], baseline, mode: 'update'});
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.conflicts, []);
});

test('asset transport rejects unexpected origins before sending any credentials', async () => {
  let calls = 0;
  const source = {_id: 'book-a', _type: 'book', cover: {asset: {_type: 'reference', _ref: 'image-bad'}}};
  const adapter = syncStorage({id: '00000000-0000-4000-8000-000000000001', targetToken: 'fixture', db: {}, storage: {bucket: () => ({})},
    fetch: async () => {calls++; return Response.json({result: [source, {_id: 'image-bad', _type: 'sanity.imageAsset', url: 'https://attacker.invalid/image'}]});}});
  await adapter.readSource();
  await assert.rejects(adapter.copyDocument(structuredClone(source)), /Invalid asset origin/);
  assert.equal(calls, 1);
});

test('recording recovery verifies immutable backup bytes before accepting its new generation', async () => {
  let corrupt = false;
  const writes = [];
  const storage = {bucket: name => ({file: (key, options) => ({
    name: key,
    exists: async () => [false],
    copy: async (target, settings) => {
      assert.equal(name, 'megvandeusen-staging-editorial');
      assert.equal(settings.preconditionOpts.ifGenerationMatch, 0);
      writes.push(target.name);
    },
    getMetadata: async () => [{size: '256', crc32c: name.endsWith('editorial') || !corrupt ? 'verified-crc' : 'corrupt-crc', generation: options?.generation || '20'}],
  })})};
  const adapter = syncStorage({id: '00000000-0000-4000-8000-000000000001', targetToken: 'fixture', db: {}, storage});
  const doc = {_id: 'practice', _type: 'meditation', privateAudio: {objectKey: 'recordings/00000000-0000-4000-8000-000000000002.mp3', generation: '10'}};
  const restored = await adapter.restoreMedia(structuredClone(doc));
  assert.equal(restored.privateAudio.generation, '20');
  assert.notEqual(restored.privateAudio.objectKey, doc.privateAudio.objectKey);
  assert.equal(writes.length, 1);
  corrupt = true;
  await assert.rejects(adapter.restoreMedia(structuredClone(doc)), /checksum mismatch/);
});
