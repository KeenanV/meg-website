import {memoryDeliveries} from '../src/webhook-deliveries.mjs';
import {memoryAllowance} from '../src/abuse.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentTarget, createServiceHandler} from '../src/service-handler.mjs';
import {createServer} from 'node:http';
import {encodeSignatureHeader} from '@sanity/webhook';

test('publishing destinations are bound to the cloud project and dataset', () => {
  assert.deepEqual(deploymentTarget('megvandeusen-staging', 'staging'), {dataset: 'staging', branch: 'staging', workflow: 'deploy-staging.yml'});
  assert.deepEqual(deploymentTarget('megvandeusen-website', 'production'), {dataset: 'production', branch: 'master', workflow: 'deploy.yml'});
  assert.throws(() => deploymentTarget('megvandeusen-staging', 'production'));
  assert.throws(() => deploymentTarget('megvandeusen-website', 'staging'));
  assert.throws(() => deploymentTarget('unknown', 'production'));
  assert.throws(() => createServiceHandler({GOOGLE_CLOUD_PROJECT: 'megvandeusen-staging', SANITY_DATASET: 'staging', CONTACT_RECIPIENT: 'someone@example.com'}));
});

test('signed publishing events dispatch the fixed environment with the content publishing input', async t => {
  const localFetch = globalThis.fetch;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/repos/KeenanV/meg-website/actions/workflows/'));
    calls.push({url, body: JSON.parse(options.body)});
    return new Response(null, {status: 204});
  });
  for (const [project, dataset, branch, workflow] of [
    ['megvandeusen-staging', 'staging', 'staging', 'deploy-staging.yml'],
    ['megvandeusen-website', 'production', 'master', 'deploy.yml'],
  ]) {
    const server = createServer(createServiceHandler({GOOGLE_CLOUD_PROJECT: project, SANITY_DATASET: dataset,
      SANITY_PROJECT_ID: 'ap0mc9ri', CONTACT_RECIPIENT: 'keenanvandeusen@gmail.com',
      SANITY_WEBHOOK_SECRET: 'test-secret', GITHUB_WORKFLOW_TOKEN: 'test-token'}, {deliveryStore: memoryDeliveries(), publicationAllowance: memoryAllowance()}));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
    const body = JSON.stringify({projectId: 'ap0mc9ri', dataset, id: 'book-fixture', type: 'book', operation: 'update',
      branch: 'untrusted-branch', workflow: 'untrusted.yml', inputs: {deployment_type: 'full'}});
    const response = await localFetch(`http://127.0.0.1:${server.address().port}/sanity-hook`, {
      method: 'POST', headers: {'Content-Type': 'application/json',
        'sanity-webhook-signature': await encodeSignatureHeader(body, Date.now(), 'test-secret')}, body,
    });
    assert.equal(response.status, 202);
    assert.deepEqual(calls.at(-1), {url: `https://api.github.com/repos/KeenanV/meg-website/actions/workflows/${workflow}/dispatches`,
      body: {ref: branch, inputs: {deployment_type: 'content'}}});
    await response.body.cancel();
  }
});

test('exhausted shared publication allowance cannot dispatch or acknowledge an undelivered event', async t => {
  const localFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async () => {assert.fail('No upstream call permitted');});
  const handler = createServiceHandler({GOOGLE_CLOUD_PROJECT: 'megvandeusen-website', SANITY_DATASET: 'production',
    SANITY_PROJECT_ID: 'ap0mc9ri', SANITY_WEBHOOK_SECRET: 'fixture', GITHUB_WORKFLOW_TOKEN: 'fixture'},
  {deliveryStore: memoryDeliveries(), publicationAllowance: async () => false});
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const body = JSON.stringify({projectId: 'ap0mc9ri', dataset: 'production', id: 'book', type: 'book', operation: 'update'});
  const response = await localFetch(`http://127.0.0.1:${server.address().port}/sanity-hook`, {method: 'POST',
    headers: {'Content-Type': 'application/json', 'sanity-webhook-signature': await encodeSignatureHeader(body, Date.now(), 'fixture')}, body});
  assert.equal(response.status, 503);
  await response.body.cancel();
});
