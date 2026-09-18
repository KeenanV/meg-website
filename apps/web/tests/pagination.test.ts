import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, listingPath, pageLinks } from '../src/lib/pagination.ts';
import { LruCache } from '../src/lib/lru-cache.ts';

const articles = (count: number) => Array.from({ length: count }, (_, i) => ({ slug: `article-${i + 1}` }));

test('archives split into twelve-card pages without omissions or duplicates', () => {
  for (const count of [0, 1, 12, 13, 16, 24, 25, 125]) {
    const items = articles(count);
    const { totalPages } = paginate(items);
    const pages = Array.from({ length: totalPages }, (_, i) => paginate(items, i + 1).entries);
    assert.deepEqual(pages.flat(), items);
    assert(pages.every(page => page.length <= 12));
    assert.equal(totalPages, Math.max(1, Math.ceil(count / 12)));
  }
  assert.equal(paginate(articles(16), 2).entries.length, 4);
});

test('direct articles select the same listing page as grid navigation', () => {
  const items = articles(25);
  for (const [slug, expected] of [['article-1', 1], ['article-12', 1], ['article-13', 2], ['article-24', 2], ['article-25', 3]] as const) {
    const result = paginate(items, 1, slug);
    assert.equal(result.page, expected);
    assert(result.entries.some(entry => entry.slug === slug));
  }
  assert.throws(() => paginate(items, 1, 'missing'), /missing/);
  for (const page of [0, -1, 1.5, 4]) assert.throws(() => paginate(items, page), /Invalid listing page/);
});

test('listing URLs and navigation remain compact as either archive grows', () => {
  for (const kind of ['blog', 'news'] as const) {
    assert.equal(listingPath(kind), `/${kind}`);
    assert.equal(listingPath(kind, 2), `/${kind}/page/2/`);
  }
  assert.deepEqual(pageLinks(1, 1), [1]);
  assert.deepEqual(pageLinks(1, 2), [1, 2]);
  assert.deepEqual(pageLinks(50, 100), [1, 'gap', 49, 50, 51, 'gap', 100]);
  assert.deepEqual(pageLinks(100, 100), [1, 'gap', 99, 100]);
});

test('article cache evicts least recently used entries and releases overwritten content', () => {
  const cache = new LruCache<string>(5);
  for (let i = 1; i <= 5; i++) cache.set(String(i), `article ${i}`);
  assert.equal(cache.get('1'), 'article 1');
  cache.set('6', 'article 6');
  assert.equal(cache.get('2'), undefined);
  assert.equal(cache.get('1'), 'article 1');
  cache.set('1', 'updated');
  assert.equal(cache.get('1'), 'updated');
  assert.equal(cache.size, 5);
  for (let i = 7; i < 1000; i++) cache.set(String(i), `article ${i}`);
  assert.equal(cache.size, 5);
  assert.equal(cache.get('1'), undefined);
  assert.equal(cache.get('999'), 'article 999');
  assert.throws(() => new LruCache(0), /positive integer/);
});
