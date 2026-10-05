import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {studioUploadHandler, sanityEditor, bucketUploads, MAX_AUDIO_BYTES} from '../src/studio-upload.mjs';
import {edgeClientIdentity} from '../src/client-identity.mjs';
import {sanityPrivateCatalog} from '../src/private-catalog.mjs';

test('only verified human editors of this Sanity project may upload', async () => {
  for (const [role, project, user, permitted] of [
    ['administrator', 'ap0mc9ri', 'editor', true], ['editor', 'ap0mc9ri', 'editor', true],
    ['viewer', 'ap0mc9ri', 'editor', false], ['administrator', 'other', 'editor', false],
    ['administrator', 'ap0mc9ri', 'someone-else', false],
  ]) {
    const request = async url => {
      assert.equal(new URL(url).hostname, 'ap0mc9ri.api.sanity.io');
      return {ok: true, json: async () => url.endsWith('/users/me') ? {id: 'editor'} : {
      id: project, members: [{id: user, isRobot: false, roles: [{name: role}]}],
      }};
    };
    assert.equal(Boolean(await sanityEditor('test-token-long-enough', 'ap0mc9ri', request)), permitted);
  }
  assert.equal(await sanityEditor('', 'ap0mc9ri'), null);
  assert.equal(await sanityEditor('test-token-long-enough', 'ap0mc9ri', async () => ({ok: false})), null);
});

test('upload API rejects anonymous, cross-environment, oversized, and cross-origin requests', async t => {
  let starts = 0;
  const handler = studioUploadHandler({origins: ['http://localhost:3334'], dataset: 'staging',
    authorize: async token => token === 'editor-token' ? 'editor' : null, allow: async () => true,
    uploads: {start: async () => {starts++; return {id: 'fixture'};}, finish: async () => null},
  });
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const url = `http://127.0.0.1:${server.address().port}/api/studio/uploads/start`;
  const data = {dataset: 'staging', size: 100, contentType: 'audio/mpeg'};
  const post = (body = data, headers = {}) => fetch(url, {method: 'POST', headers: {
    Origin: 'http://localhost:3334', 'Content-Type': 'application/json', 'X-Sanity-Token': 'editor-token', ...headers,
  }, body: JSON.stringify(body)});
  assert.equal((await post(data, {'X-Sanity-Token': ''})).status, 403);
  assert.equal((await post(data, {Origin: 'https://attacker.example'})).status, 403);
  assert.equal((await post({...data, dataset: 'production'})).status, 400);
  assert.equal((await post({...data, size: MAX_AUDIO_BYTES + 1})).status, 400);
  assert.equal((await post({...data, contentType: 'text/html'})).status, 400);
  assert.equal((await post({...data, padding: 'x'.repeat(4096)})).status, 413);
  assert.equal(starts, 0);
  assert.equal((await post()).status, 200);
  assert.equal(starts, 1);
});

test('finalization binds owner, expiry and immutable source generation; replay cannot replace finalized bytes', async () => {
  const tickets = new Map(), objects = new Map();
  let generation = 10;
  const db = {collection: () => ({doc: id => ({
    create: async value => tickets.set(id, value), get: async () => ({data: () => tickets.get(id)}),
    update: async value => tickets.set(id, {...tickets.get(id), ...value}),
  })})};
  const bucket = {file: (name, options) => ({
    name,
    generateSignedPostPolicyV4: async policy => {
      assert.deepEqual(policy.conditions, [['content-length-range', 10, 10]]);
      assert.equal(policy.fields['Content-Type'], 'audio/mpeg');
      return [{url: 'https://storage.example', fields: {key: name}}];
    },
    getMetadata: async () => [objects.get(name)],
    download: async () => {assert.equal(options.generation, '10'); return [Buffer.from('ID3fixture')];},
    copy: async (target, config) => {
      assert.equal(options.generation, '10');
      assert.equal(config.preconditionOpts.ifGenerationMatch, 0);
      objects.set(target.name, {...objects.get(name), generation: String(++generation)});
    },
  })};
  let time = 1000;
  const uploads = bucketUploads(bucket, db, () => time);
  const started = await uploads.start('editor', 10);
  assert.equal(await uploads.finish('other-user', started.id), null);
  objects.set(started.fields.key, {generation: '10', size: '10', contentType: 'audio/mpeg'});
  const result = await uploads.finish('editor', started.id);
  assert.match(result.objectKey, /^recordings\//);
  assert.equal(result.generation, '11');
  objects.set(started.fields.key, {generation: '12', size: '10', contentType: 'text/html'});
  assert.deepEqual(await uploads.finish('editor', started.id), result);
  time += 900_001;
  assert.equal(await uploads.finish('editor', started.id), null);
});

test('public client identity requires trusted ingress proof; spoofed XFF alone never works', () => {
  const key = 'a'.repeat(43);
  const identify = edgeClientIdentity(key);
  assert.throws(() => identify({headers: {'x-forwarded-for': '192.0.2.1', 'x-meg-client-ip': '192.0.2.1'}}));
  assert.throws(() => identify({headers: {'x-meg-edge-key': 'wrong', 'x-meg-client-ip': '192.0.2.1'}}));
  assert.throws(() => identify({headers: {'x-meg-edge-key': key, 'x-meg-client-ip': '192.0.2.1, 192.0.2.2'}}));
  const first = identify({headers: {'x-meg-edge-key': key, 'x-meg-client-ip': '2001:db8::1'}});
  assert.equal(first, identify({headers: {'x-meg-edge-key': key, 'x-meg-client-ip': '2001:0db8:0:0:0:0:0:1'}}));
  assert.notEqual(first, identify({headers: {'x-meg-edge-key': key, 'x-meg-client-ip': '2001:db8::2'}}));
});

test('published private catalog rejects untrusted keys, drafts, generations and image hosts', async () => {
  const valid = {_id: 'one', title: 'Breathing', excerpt: 'Practice', privateAudio: {
    objectKey: 'recordings/12345678-1234-1234-1234-123456789012.mp3', generation: '123'},
    imageUrl: 'https://attacker.example/image.jpg'};
  let reads = 0;
  const catalog = sanityPrivateCatalog({project: 'ap0mc9ri', dataset: 'staging', request: async () => {
    reads++;
    return {ok: true, json: async () => ({result: [valid, {...valid, _id: 'drafts.two'},
      {...valid, privateAudio: {objectKey: '../secret', generation: '123'}}, {...valid, privateAudio: {objectKey: valid.privateAudio.objectKey}}]})};
  }});
  const [a, b] = await Promise.all([catalog(), catalog()]);
  assert.equal(reads, 1);
  assert.equal(a.length, 1);
  assert.equal(a[0].imageUrl, null);
  assert.deepEqual(a, b);
});
