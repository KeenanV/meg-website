import assert from 'node:assert/strict';
import test from 'node:test';
import {publishingMode} from '../scripts/publishing-mode.mjs';

const sha = 'a'.repeat(40);
const input = {requested: 'content', event: 'workflow_dispatch', repository: 'KeenanV/meg-website',
  branch: 'master', sha, workflow: 'deploy.yml', token: 'fixture-token'};
const success = {id: 123, head_sha: sha, head_branch: 'master', conclusion: 'success'};
const reply = body => new Response(JSON.stringify(body), {status: 200});

test('code pushes and explicit full releases cannot take the content shortcut', async () => {
  const request = () => {throw new Error('History must not be queried');};
  assert.equal(await publishingMode({...input, event: 'push', request}), 'full');
  assert.equal(await publishingMode({...input, requested: 'full', request}), 'full');
});

test('content publishing skips code only after a successful full release of this exact branch and commit', async () => {
  const request = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('head_sha'), sha);
    assert.equal(parsed.searchParams.get('branch'), 'master');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    return reply({workflow_runs: parsed.searchParams.get('event') === 'push' ? [success] : []});
  };
  assert.equal(await publishingMode({...input, request}), 'content');
  for (const other of [{...success, head_sha: 'b'.repeat(40)}, {...success, head_branch: 'staging'}, {...success, conclusion: 'failure'}]) {
    assert.equal(await publishingMode({...input, request: async () => reply({workflow_runs: [other]})}), 'full');
  }
});

test('a cancelled or missing pending code deployment is replaced by a full release, never content alone', async () => {
  assert.equal(await publishingMode({...input, request: async () => reply({workflow_runs: []})}), 'full');
});

test('manual and fallback full releases count only when their final full-release step succeeded', async () => {
  for (const conclusion of ['success', 'skipped', 'failure']) {
    const request = async url => {
      if (url.includes('/jobs?')) return reply({jobs: [{conclusion: 'success', steps: [{name: 'Full deployment completed', conclusion}]}]});
      return reply({workflow_runs: url.includes('event=push') ? [] : [success]});
    };
    assert.equal(await publishingMode({...input, request}), conclusion === 'success' ? 'content' : 'full');
  }
});

test('history failures and cross-environment or untrusted sources fail closed', async () => {
  await assert.rejects(publishingMode({...input, request: async () => new Response('', {status: 403})}), /history unavailable/);
  for (const change of [{repository: 'someone/fork'}, {workflow: 'deploy-staging.yml'}, {branch: 'feature'},
    {requested: 'anything'}, {token: ''}, {event: 'pull_request'}, {sha: 'invalid'}]) {
    await assert.rejects(publishingMode({...input, ...change}));
  }
});
