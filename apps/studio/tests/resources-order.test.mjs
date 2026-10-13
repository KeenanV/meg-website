import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {privateCatalogQuery, sanityPrivateCatalog} from '../../backend/src/private-catalog.mjs';

// Use Studio's actual GROQ engine to execute the catalog query against fixtures.
const require = createRequire(import.meta.url);
const {parse, evaluate} = createRequire(require.resolve('sanity/package.json'))('groq-js');
const recording = (_id, title, orderRank) => ({_id, _type: 'meditation', title,
  excerpt: 'A practice.', ...(orderRank && {orderRank}),
  privateAudio: {objectKey: 'recordings/12345678-1234-1234-1234-123456789abc.mp3', generation: '1'}});
const query = async documents => (await evaluate(parse(privateCatalogQuery), {dataset: documents})).get();

test('Resources follows manual ranks, with stable alphabetical fallback for existing recordings', async () => {
  const legacy = [recording('b', 'Breathing'), recording('a2', 'Awareness'), recording('a1', 'Awareness')];
  assert.deepEqual((await query(legacy)).map(item => item._id), ['a1', 'a2', 'b']);
  const ranked = [recording('z', 'Zen', '0|000008:'), recording('c', 'Calm', '0|000010:')];
  assert.deepEqual((await query([...legacy, ...ranked])).map(item => item._id), ['z', 'c', 'a1', 'a2', 'b']);
  ranked[1].orderRank = '0|000004:';
  assert.deepEqual((await query(ranked)).map(item => item._id), ['c', 'z']);
  assert.deepEqual(await query([{_id: 'unfinished', _type: 'meditation', title: 'Missing audio'}]), []);
});

test('published catalog preserves manual order and refreshes it after the cache expires', async () => {
  let now = 0, requests = 0;
  const docs = [recording('b', 'Breathing', '0|000008:'), recording('a', 'Awareness', '0|000010:')];
  const catalog = sanityPrivateCatalog({project: 'ap0mc9ri', dataset: 'staging', now: () => now,
    request: async url => {
      requests++;
      assert.equal(url.searchParams.get('perspective'), 'published');
      const result = await (await evaluate(parse(url.searchParams.get('query')), {dataset: docs})).get();
      return Response.json({result});
    }});
  assert.deepEqual((await catalog()).map(item => item.title), ['Breathing', 'Awareness']);
  docs[1].orderRank = '0|000004:';
  await catalog();
  assert.equal(requests, 1);
  now = 30_001;
  assert.deepEqual((await catalog()).map(item => item.title), ['Awareness', 'Breathing']);
  assert.equal(requests, 2);
});
