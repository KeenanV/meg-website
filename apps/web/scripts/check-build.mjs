import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const files = fs.readdirSync(root, { recursive: true });
const pages = files.filter(file => file.endsWith('.html'));
assert(pages.includes('404.html'), 'Missing custom 404');
assert(!files.some(file => file === 'debug' || file.startsWith('debug/')), 'Debug route shipped');
let localTargets = 0;
const articleLinks = html => [...html.matchAll(/<a\b(?=[^>]*\bdata-article-link)[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1]);
const listings = new Map();
const articles = [];
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, file + ': expected one primary heading');
  assert.match(html, /<meta[^>]*name="description"[^>]*content="[^"]+"/, file + ': missing description');
  assert.doesNotMatch(html, /https:\/\/example\.com/, file + ': placeholder domain');
  if (/^(blog|news)\//.test(file)) {
    const links = articleLinks(html);
    assert(links.length <= 12, file + ': more than 12 background cards');
    const listingPath = html.match(/data-article-results[^>]*data-listing-path="([^"]+)"/)?.[1];
    assert(listingPath, file + ': missing listing URL');
    if (/^(blog|news)\/(?:page\/\d+\/)?index\.html$/.test(file)) {
      listings.set(listingPath, links);
      const total = Number(html.match(/data-total-pages="(\d+)"/)?.[1]);
      assert.equal(html.includes('data-listing-link'), total > 1, file + ': unexpected pagination controls');
    } else articles.push({ file, listingPath, links });
  }
  if (/^(blog|news)\/[^/]+\/index\.html$/.test(file)) {
    const articlePath = '/' + file.replace(/\/index\.html$/, '');
    assert.match(html, /<dialog[^>]*\sopen[\s>]/, file + ': direct article must be open on arrival');
    assert.match(html, /data-initial-article="true"/, file + ': missing direct-entry viewer state');
    assert.match(html, /data-article-link/, file + ': missing background card grid');
    assert.match(html, new RegExp('<a\\b(?=[^>]*href="' + articlePath + '")(?=[^>]*\\bdata-article-link)[^>]*>'),
      file + ': missing return destination card');
  }
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (href.startsWith('//')) continue;
    const target = path.join(root, decodeURIComponent(href.split(/[?#]/)[0]));
    assert(fs.existsSync(target) || fs.existsSync(path.join(target, 'index.html')), file + ': missing ' + href);
    localTargets++;
  }
}
for (const { file, listingPath, links } of articles) {
  assert.deepEqual(links, listings.get(listingPath), file + ': direct article grid differs from its listing page');
}
for (const kind of ['blog', 'news']) {
  const links = [...listings].filter(([url]) => url.startsWith('/' + kind)).flatMap(([, cards]) => cards);
  const routes = articles.filter(({ file }) => file.startsWith(kind + '/'));
  assert.equal(new Set(links).size, links.length, kind + ': duplicate cards across pages');
  assert.equal(links.length, routes.length, kind + ': pagination omitted articles');
}
const totalBytes = files.reduce((sum, file) => {
  const stat = fs.statSync(path.join(root, file));
  return sum + (stat.isFile() ? stat.size : 0);
}, 0);
assert(totalBytes < 10 * 1024 * 1024, 'Build exceeds 10 MiB; check whether original images are being published.');
console.log('Verified ' + pages.length + ' pages and ' + localTargets + ' local targets; output ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MiB.');
