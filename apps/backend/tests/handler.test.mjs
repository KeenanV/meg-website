import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { encodeSignatureHeader } from '@sanity/webhook';
import { createHandler } from '../src/handler.mjs';

const origin = 'https://preview.example.com';
const config = {
  origins: [origin], recipient: 'owner@example.com', sender: 'Website <onboarding@resend.dev>',
  resendKey: 'test-key', siteKey: 'test-site-key', webhookSecret: 'test-secret',
  githubToken: 'test-token', sanityProject: 'test-project', sanityDataset: 'production',
};
const message = () => ({ name: 'Reader', email: 'reader@example.com', message: 'Hello\nMeg!', token: 'valid-token', requestId: randomUUID(), website: '' });
const event = overrides => ({ projectId: 'test-project', dataset: 'production', id: 'post-1', type: 'blogPost', operation: 'update', revision: 'rev-1', ...overrides });

async function setup(t, overrides = {}) {
  const emails = [], dispatches = [], assessments = [], logs = [];
  const server = createServer(createHandler({
    config,
    assess: async (...args) => {
      assessments.push(args);
      return { tokenProperties: { valid: true, action: 'contact', hostname: 'preview.example.com' }, riskAnalysis: { score: 0.9 } };
    },
    sendEmail: async (...args) => { emails.push(args); }, dispatch: async () => { dispatches.push(true); },
    log: entry => logs.push(entry), ...overrides,
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${url}/contact`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const hook = async (data = event(), signature) => {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    return fetch(`${url}/sanity-hook`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'sanity-webhook-signature': signature ?? await encodeSignatureHeader(raw, Date.now(), config.webhookSecret),
    }, body: raw });
  };
  return { url, post, hook, emails, dispatches, assessments, logs };
}

test('contact sends only to configured recipient with visitor Reply-To and stable retry key', async t => {
  const { post, emails } = await setup(t);
  const input = { ...message(), to: 'attacker@example.com', from: 'attacker@example.com' };
  assert.equal((await post(input)).status, 200);
  assert.equal((await post(input)).status, 200);
  assert.deepEqual(emails[0][0].to, [config.recipient]);
  assert.equal(emails[0][0].from, config.sender);
  assert.equal(emails[0][0].reply_to, input.email);
  assert.match(emails[0][0].text, /Hello\nMeg!/);
  assert.equal(emails[0][1], emails[1][1]);
  assert.equal((await post({ ...input, message: 'Edited message' })).status, 200);
  assert.notEqual(emails[0][1], emails[2][1]);
});

test('rejects invalid fields, header injection, and oversized body without upstream calls', async t => {
  const { post, emails, assessments } = await setup(t);
  for (const data of [null, [], {}, { ...message(), name: 'Reader\r\nBcc: x' }, { ...message(), email: 'a@b.com\r\nx' },
    { ...message(), message: ' ' }, { ...message(), message: 'x'.repeat(5001) }, { ...message(), requestId: 'bad' }]) {
    assert.equal((await post(data)).status, 400);
  }
  assert.equal((await post({ ...message(), message: 'x'.repeat(40_000) })).status, 413);
  assert.equal(emails.length, 0);
  assert.equal(assessments.length, 0);
});

test('CORS only grants exact configured origins; JSON and POST are required', async t => {
  const { url, post } = await setup(t);
  assert.equal((await post(message(), { Origin: 'https://evil.example.com' })).status, 403);
  assert.equal((await post(message(), { Origin: `${origin}.evil.example.com` })).status, 403);
  assert.equal((await post(message(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(`${url}/contact`, { headers: { Origin: origin } })).status, 405);
  const preflight = await fetch(`${url}/contact`, { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
});

test('honeypot is discarded; missing configuration fails closed', async t => {
  const ready = await setup(t);
  assert.equal((await ready.post({ ...message(), website: 'spam' })).status, 200);
  assert.equal(ready.emails.length, 0);
  const missing = await setup(t, { config: { ...config, resendKey: '' } });
  assert.equal((await missing.post(message())).status, 503);
});

test('reCAPTCHA requires valid token, correct action and host, and acceptable score', async t => {
  for (const assessment of [null, {},
    { tokenProperties: { valid: false, action: 'contact', hostname: 'preview.example.com' }, riskAnalysis: { score: 0.9 } },
    { tokenProperties: { valid: true, action: 'other', hostname: 'preview.example.com' }, riskAnalysis: { score: 0.9 } },
    { tokenProperties: { valid: true, action: 'contact', hostname: 'evil.example.com' }, riskAnalysis: { score: 0.9 } },
    { tokenProperties: { valid: true, action: 'contact', hostname: 'preview.example.com' }, riskAnalysis: { score: 0.1 } },
  ]) {
    const { post, emails } = await setup(t, { assess: async () => assessment });
    assert.equal((await post(message())).status, 403);
    assert.equal(emails.length, 0);
  }
});

test('rate limits contact attempts and expires counters', async t => {
  let time = 1000;
  const { post, emails } = await setup(t, { now: () => time });
  for (let i = 0; i < 3; i++) assert.equal((await post(message())).status, 200);
  assert.equal((await post(message())).status, 429);
  assert.equal(emails.length, 3);
  time += 600_001;
  assert.equal((await post(message())).status, 200);
});

test('upstream delivery failure does not expose provider response or private message', async t => {
  const { post, logs } = await setup(t, { sendEmail: async () => { throw new Error('secret-provider-response'); } });
  const response = await post(message());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text() + logs.join(''), /secret-provider-response|reader@example.com|Hello/);
});

test('signed create, update and delete trigger builds; duplicate body is deduplicated', async t => {
  const { hook, dispatches } = await setup(t);
  for (const operation of ['create', 'update', 'delete']) assert.equal((await hook(event({ operation }))).status, 202);
  assert.equal((await hook(event({ operation: 'delete' }))).status, 202);
  assert.equal(dispatches.length, 3);
});

test('untrusted signature, changed payload, wrong project, and unpublished events are rejected', async t => {
  const { hook, dispatches } = await setup(t);
  assert.equal((await hook(event(), 'invalid')).status, 401);
  const signature = await encodeSignatureHeader(JSON.stringify(event()), Date.now(), config.webhookSecret);
  assert.equal((await hook(event({ id: 'changed' }), signature)).status, 401);
  for (const overrides of [{ id: 'drafts.post-1' }, { id: 'versions.release.post-1' }, { projectId: 'other' }, { dataset: 'staging' }, { type: 'unknown' }]) {
    assert.equal((await hook(event(overrides))).status, 400);
  }
  assert.equal((await hook('null')).status, 400);
  assert.equal(dispatches.length, 0);
});

test('failed dispatch remains retryable and simultaneous duplicates share one dispatch', async t => {
  let attempts = 0;
  const { hook } = await setup(t, { dispatch: async () => {
    if (++attempts === 1) throw new Error('outage');
    await new Promise(resolve => setTimeout(resolve, 30));
  } });
  assert.equal((await hook()).status, 503);
  const results = await Promise.all([hook(), hook()]);
  assert.deepEqual(results.map(result => result.status), [202, 202]);
  assert.equal(attempts, 2);
});
