import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {stagingGateway} from '../src/staging-gateway.mjs';

test('staging gate protects HTML, assets, API, and error routes on any hostname; noindex/no-store everywhere', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'meg-staging-test-'));
  await writeFile(path.join(directory, 'index.html'), 'PRIVATE STAGING');
  await writeFile(path.join(directory, 'app.js'), 'PRIVATE SCRIPT');
  await writeFile(path.join(directory, '404.html'), 'PRIVATE 404');
  let resourceRequests = 0;
  let publishingRequests = 0;
  const credential = 'reviewer:test-fixture';
  const basicHash = createHash('sha256').update(credential).digest('hex');
  const server = createServer(stagingGateway({directory, basicHash,
    publishing: async (_req, res) => {publishingRequests++; res.writeHead(401); res.end('Independent service authentication');},
    resources: async (_req, res) => {resourceRequests++; res.writeHead(401); res.end('Book password still required');}}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => {server.close(resolve); server.closeAllConnections();}); await rm(directory, {recursive: true}); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/', '/app.js', '/api/resources/catalog', '/404.html', '/does-not-exist', '/robots.txt']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
  assert.equal(resourceRequests, 0);
  assert.equal((await fetch(origin + '/contact', {method: 'POST'})).status, 401);
  assert.equal(publishingRequests, 0);
  assert.equal((await fetch(origin + '/sanity-hook', {method: 'POST'})).status, 401);
  assert.equal(publishingRequests, 1);
  const headers = {Authorization: 'Basic ' + Buffer.from(credential).toString('base64')};
  assert.equal((await fetch(origin + '/contact', {method: 'POST', headers})).status, 401);
  assert.equal(publishingRequests, 2);
  assert.equal(await (await fetch(origin + '/', {headers})).text(), 'PRIVATE STAGING');
  assert.equal(await (await fetch(origin + '/app.js', {headers})).text(), 'PRIVATE SCRIPT');
  assert.equal((await fetch(origin + '/api/resources/catalog', {headers})).status, 401);
  assert.equal(resourceRequests, 1);
  assert.equal((await fetch(origin + '/.env', {headers})).status, 404);
  assert.equal((await fetch(origin + '/', {headers: {Authorization: 'Basic ' + Buffer.from('wrong:password').toString('base64')}})).status, 401);
  let rejected;
  for (let i = 0; i < 65; i++) rejected = await fetch(origin + '/');
  assert.equal(rejected.status, 429);
  // An attacker must not lock a reviewer with the correct credential out.
  assert.equal((await fetch(origin + '/', {headers})).status, 200);
});
