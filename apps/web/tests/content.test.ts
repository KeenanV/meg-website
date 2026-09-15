import test from 'node:test';
import assert from 'node:assert/strict';
import { portableTextToHtml } from '../src/lib/portableText.ts';
import { safeHref } from '../src/lib/urls.ts';
import { formatDate } from '../src/lib/dates.ts';
import { articlePaths } from '../src/lib/content.ts';
import { sanityConfig } from '../src/lib/sanityConfig.ts';
import type { RichText } from '../src/lib/content.ts';

const paragraph = (text: string, href?: string): RichText => [{
  _type: 'block', _key: 'paragraph', style: 'normal',
  markDefs: href ? [{ _type: 'link', _key: 'link', href }] : [],
  children: [{ _type: 'span', _key: 'text', text, marks: href ? ['link'] : [] }],
}];

test('unsafe protocols, disguised schemes and external protocol-relative links are rejected', () => {
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', '//evil.example',
    '/\\evil.example', 'https://example.com\n.evil.example', 'file:///etc/passwd',
    'https://user:password@example.com', 'not a url']) {
    assert.equal(safeHref(href), undefined, href);
    assert.doesNotMatch(portableTextToHtml(paragraph('Read this', href)), /<a\b/);
  }
});
test('normal website, email, and local links remain usable', () => {
  for (const href of ['https://example.com/book?a=1&b=2', 'http://example.com',
    'mailto:hello@example.com', '/about#approach', '#fees', '?page=2']) {
    assert.equal(safeHref(href), href);
  }
  assert.match(portableTextToHtml(paragraph('Book', 'https://example.com')), /rel="noopener noreferrer"/);
  assert.doesNotMatch(portableTextToHtml(paragraph('Fees', '#fees')), /target=/);
});
test('rich text and URL attributes escape markup instead of creating executable HTML', () => {
  const html = portableTextToHtml(paragraph('<script>alert("x")</script>', 'https://example.com/"onmouseover="alert(1)'));
  assert.doesNotMatch(html, /<script|href="[^"]*"onmouseover=/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;/);
});
test('image alt text is escaped, while missing and malformed assets are skipped', () => {
  const value: RichText = [{ _type: 'image', asset: { _ref: 'image-example-600x400-jpg' }, alt: '"><script>alert(1)</script>' }];
  const html = portableTextToHtml(value, () => 'https://cdn.sanity.io/image.jpg?w=600&h=400');
  assert.match(html, /alt="&quot;&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(portableTextToHtml(value, () => { throw new Error('Invalid asset'); }), '');
  assert.equal(portableTextToHtml(value, () => 'javascript:alert(1)'), '');
  assert.equal(portableTextToHtml(value), '');
});
test('missing rich text produces a safe empty state', () => {
  assert.equal(portableTextToHtml(undefined), '');
  assert.equal(portableTextToHtml(null), '');
  assert.equal(portableTextToHtml([]), '');
});
test('headings, emphasis, and lists are preserved for all article types', () => {
  const rich: RichText = [
    { _type: 'block', style: 'h2', markDefs: [], children: [{ _type: 'span', text: 'Heading', marks: [] }] },
    { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, markDefs: [], children: [{ _type: 'span', text: 'Important', marks: ['strong'] }] },
  ];
  const html = portableTextToHtml(rich);
  assert.match(html, /<h2>Heading<\/h2>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<strong>Important<\/strong>/);
});
test('calendar dates are stable across local and cloud timezones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/Los_Angeles', 'UTC', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      assert.equal(formatDate('2020-02-06'), 'February 6, 2020');
      assert.equal(formatDate('2016-08-07T00:00:00Z'), 'August 7, 2016');
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  assert.equal(formatDate('2026-02-30'), '');
  assert.equal(formatDate('bad date'), '');
  assert.equal(formatDate(), '');
});
test('route generation rejects broken slugs and detects collisions', () => {
  const good = { title: 'A post', slug: 'a-post' };
  const paths = articlePaths([good, { title: 'Missing', slug: '' }, { title: 'Bad', slug: '../escape' }]);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].props.entry, good);
  assert.deepEqual(paths[0].params, { slug: 'a-post' });
  assert.throws(() => articlePaths([good, good]), /Duplicate article slug/);
  assert.deepEqual(articlePaths([]), []);
});
test('Sanity setup errors are actionable and build queries always use fresh published content', () => {
  assert.throws(() => sanityConfig({}), /apps\/web\/\.env/);
  assert.throws(() => sanityConfig({ PUBLIC_SANITY_PROJECT_ID: 'yourProjectId' }), /PUBLIC_SANITY_PROJECT_ID/);
  assert.throws(() => sanityConfig({ PUBLIC_SANITY_PROJECT_ID: 'ap0mc9ri', PUBLIC_SANITY_API_VERSION: '2026-02-30' }), /YYYY-MM-DD/);
  assert.throws(() => sanityConfig({ PUBLIC_SANITY_PROJECT_ID: 'ap0mc9ri', PUBLIC_SANITY_DATASET: '../private' }), /DATASET/);
  const config = sanityConfig({ PUBLIC_SANITY_PROJECT_ID: 'ap0mc9ri' });
  assert.equal(config.useCdn, false);
  assert.equal(config.perspective, 'published');
  assert.equal(config.dataset, 'production');
});
