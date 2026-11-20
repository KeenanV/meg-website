import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync} from 'node:crypto';
import {studioUploadHandler} from '../src/studio-upload.mjs';
import {studioSyncBroker} from '../src/studio-sync-broker.mjs';
import {productionGateway} from '../src/production-gateway.mjs';
import {syncAuthorization, syncSigner, syncVerifier, SYNC_BROKER_ORIGIN} from '../src/sync-capability.mjs';

test('hosted Studio upload flows through the production gateway and capability-only staging receiver', async t => {
  const keys = generateKeyPairSync('ed25519');
  const issue = syncSigner(keys.privateKey.export({type: 'pkcs8', format: 'der'}).toString('base64'));
  const nonces = new Set(), calls = [], requests = [];
  const verify = syncVerifier(keys.publicKey.export({type: 'spki', format: 'der'}).toString('base64'), async id => {
    if (nonces.has(id)) return false;
    nonces.add(id); return true;
  });
  const owner = 'a'.repeat(64), id = '12345678-1234-1234-1234-123456789012';
  const listen = async handler => {
    const server = createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const staging = await listen(studioUploadHandler({dataset: 'staging', origins: [SYNC_BROKER_ORIGIN], capabilityOnly: true,
    authorize: syncAuthorization({capability: verify}), allow: async () => true,
    uploads: {
      start: async (who, size) => {calls.push({who, size}); return {id, url: 'https://storage.googleapis.com/staging', fields: {key: `incoming/${id}.mp3`}};},
      finish: async (who, ticket) => {calls.push({who, ticket}); return {objectKey: `recordings/${ticket}.mp3`, generation: '42', size: 128};},
    },
  }));
  const production = await listen(productionGateway({
    service: (_req, res) => {res.writeHead(404); res.end();},
    sync: studioSyncBroker({issue, allow: async () => true,
      authorize: async (token, project) => token === 'dashboard-editor' && project === '77uvsyo1' ? owner : null,
      request: async (url, options) => {
        assert.equal(new URL(url).origin, 'https://megvandeusen-staging.web.app');
        requests.push({path: new URL(url).pathname, options});
        return fetch(staging + new URL(url).pathname, options);
      },
    }),
  }));
  const send = (base, path, data, headers) => fetch(base + path, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(data)});
  const browser = {Origin: 'https://meg-website-staging.sanity.studio', 'X-Sanity-Token': 'dashboard-editor'};
  const input = {dataset: 'staging', size: 128, contentType: 'audio/mpeg'};
  // Direct human sessions fail even with the broker's Origin forged.
  assert.equal((await send(staging, '/api/studio/uploads/start', input, browser)).status, 403);
  assert.equal((await send(staging, '/api/studio/uploads/start', input, {...browser, Origin: SYNC_BROKER_ORIGIN})).status, 403);
  const started = await send(production, '/api/studio/staging/uploads/start', input, browser);
  assert.equal(started.status, 200);
  assert.equal((await started.json()).id, id);
  const finished = await send(production, '/api/studio/staging/uploads/finish', {dataset: 'staging', id}, browser);
  assert.equal(finished.status, 200);
  assert.equal((await finished.json()).generation, '42');
  assert.deepEqual(calls, [{who: owner, size: 128}, {who: owner, ticket: id}]);
  for (const {path, options} of requests) {
    assert.equal(options.headers['X-Sanity-Token'], undefined);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal((await fetch(staging + path, options)).status, 403, 'replayed action must not reach storage');
  }
  assert.equal(calls.length, 2);
});
