import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require = createRequire(import.meta.url);
test('patched glob preserves Firebase archive enumeration and OpenAPI controller discovery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meg-glob-'));
  try {
    await mkdir(join(directory, 'nested'));
    await writeFile(join(directory, 'index.html'), 'fixture');
    await writeFile(join(directory, 'nested/page.html'), 'fixture');
    await writeFile(join(directory, 'nested/skip.txt'), 'fixture');
    const files = require('archiver-utils').file.expand({cwd: directory}, ['**/*.html', '!nested/*']);
    assert.deepEqual(files, ['index.html']);
    const consumer = createRequire(require.resolve('exegesis'));
    assert.deepEqual(consumer('glob').sync('**/*.html', {cwd: directory}).sort(), ['index.html', 'nested/page.html']);
  } finally {await rm(directory, {recursive: true, force: true});}
});
