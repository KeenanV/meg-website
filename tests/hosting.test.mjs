import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createWebsiteConfig } from '../scripts/hosting-config.mjs';

const require = createRequire(import.meta.url);
const firebaseRequire = createRequire(require.resolve('firebase-tools/package.json'));

test('staging has no public static upload path and routes every URL through its protected service', () => {
  const {hosting} = JSON.parse(readFileSync(new URL('../firebase.staging.json', import.meta.url), 'utf8'));
  assert.equal(hosting.site, 'megvandeusen-staging');
  assert.equal(hosting.public, '.firebase/staging-empty');
  assert.deepEqual(hosting.ignore, ['**/*']);
  assert.deepEqual(hosting.rewrites, [{source: '**', run: {serviceId: 'staging-website', region: 'us-west1', pinTag: true}}]);
  const headers = hosting.headers.find(rule => rule.source === '**').headers;
  assert(headers.some(header => header.key === 'X-Robots-Tag' && header.value.includes('noindex')));
  assert(headers.some(header => header.key === 'Cache-Control' && header.value === 'private, no-store'));
});

test('only Resources is noindex in production; all preview pages are noindex', () => {
  const preview = createWebsiteConfig();
  const live = createWebsiteConfig('live');
  const robotsHeaders = (config, source) => config.hosting.headers.filter(rule => rule.source === source).flatMap(rule => rule.headers)
    .filter(header => header.key.toLowerCase() === 'x-robots-tag');
  assert.deepEqual(robotsHeaders(preview, '**'), [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]);
  assert.deepEqual(robotsHeaders(live, '**'), []);
  assert.deepEqual(robotsHeaders(live, '/resources{,/**}'), [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]);
  const minimatch = firebaseRequire('minimatch');
  for (const url of ['/resources', '/resources/', '/resources/index.html']) assert(minimatch(url, '/resources{,/**}'));
  for (const url of ['/news', '/about', '/resources-extra']) assert(!minimatch(url, '/resources{,/**}'));
  assert.equal(live.hosting.site, 'megvandeusen-website');
  assert.equal(live.hosting.public, fileURLToPath(new URL('../apps/web/dist', import.meta.url)));
  assert.deepEqual(live.hosting.redirects, preview.hosting.redirects);
  assert.throws(() => createWebsiteConfig('production'), /must be preview or live/);
});

test('Firebase HTTP client can build multipart uploads with the patched UUID dependency', async () => {
  const { Gaxios } = firebaseRequire('gaxios');
  const client = new Gaxios();
  const response = await client.request({
    url: 'https://example.invalid/upload',
    method: 'POST',
    multipart: [{ headers: { 'Content-Type': 'text/plain' }, content: 'hosting upload smoke test' }],
    adapter: async options => {
      const contentType = options.headers['Content-Type'];
      assert.match(contentType, /^multipart\/related; boundary=[0-9a-f-]{36}$/);
      const boundary = contentType.split('boundary=')[1];
      const chunks = [];
      for await (const chunk of options.body) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      assert(body.includes('--' + boundary));
      assert(body.includes('hosting upload smoke test'));
      return { data: 'ok', status: 200, statusText: 'OK', headers: {}, config: options };
    },
  });
  assert.equal(response.data, 'ok');
});

test('Firebase Pub/Sub dependency preserves trace propagation with patched OpenTelemetry core', () => {
  const pubsubRequire = createRequire(firebaseRequire.resolve('@google-cloud/pubsub/package.json'));
  const api = pubsubRequire('@opentelemetry/api');
  const tracing = pubsubRequire('./build/src/telemetry-tracing.js');
  const original = {
    traceId: '1234567890abcdef1234567890abcdef',
    spanId: '1234567890abcdef',
    traceFlags: 1,
  };
  // Capture the parent context passed by Pub/Sub's real extraction path.
  let extracted;
  api.trace.setGlobalTracerProvider({
    getTracer: () => ({
      startSpan: (_name, _options, context) => {
        extracted = api.trace.getSpanContext(context);
        return api.trace.wrapSpanContext(extracted);
      },
    }),
  });
  tracing.setGloballyEnabled(true);
  try {
    const message = {};
    tracing.injectSpan(api.trace.wrapSpanContext(original), message);
    assert.equal(message.attributes.googclient_traceparent,
      '00-' + original.traceId + '-' + original.spanId + '-01');
    tracing.extractSpan({ attributes: { ...message.attributes } }, 'projects/test/subscriptions/test');
    assert.equal(extracted.traceId, original.traceId);
    assert.equal(extracted.spanId, original.spanId);
  } finally {
    tracing.setGloballyEnabled(false);
    api.trace.disable();
  }
});
