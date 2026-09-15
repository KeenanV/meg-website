import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const files = fs.readdirSync(root, { recursive: true });
const pages = files.filter(file => file.endsWith('.html'));
assert(pages.includes('404.html'), 'Missing custom 404');
assert(!files.some(file => file === 'debug' || file.startsWith('debug/')), 'Debug route shipped');
let localTargets = 0;
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, file + ': expected one primary heading');
  assert.match(html, /<meta[^>]*name="description"[^>]*content="[^"]+"/, file + ': missing description');
  assert.doesNotMatch(html, /https:\/\/example\.com/, file + ': placeholder domain');
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (href.startsWith('//')) continue;
    const target = path.join(root, decodeURIComponent(href.split(/[?#]/)[0]));
    assert(fs.existsSync(target) || fs.existsSync(path.join(target, 'index.html')), file + ': missing ' + href);
    localTargets++;
  }
}
const totalBytes = files.reduce((sum, file) => {
  const stat = fs.statSync(path.join(root, file));
  return sum + (stat.isFile() ? stat.size : 0);
}, 0);
assert(totalBytes < 10 * 1024 * 1024, 'Build exceeds 10 MiB; check whether original images are being published.');
console.log('Verified ' + pages.length + ' pages and ' + localTargets + ' local targets; output ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MiB.');
