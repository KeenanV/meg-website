import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../scripts/deployment-artifact.mjs', import.meta.url));
test('deployment accepts verified output and rejects tampering, source files, and links', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meg-artifact-'));
  const run = (mode, env = {}) => spawnSync(process.execPath, [script, mode], {cwd: directory, encoding: 'utf8', env: {...process.env, COPYFILE_DISABLE: '1', ...env}});
  const digest = async () => createHash('sha256').update(await readFile(join(directory, '.private/deploy-artifact.tar.gz'))).digest('hex');
  try {
    await mkdir(join(directory, 'apps/web/dist'), {recursive: true});
    await mkdir(join(directory, '.private'));
    await writeFile(join(directory, 'apps/web/dist/index.html'), '<h1>Checked build</h1>');
    await writeFile(join(directory, '.private/content-snapshot.json'), '{}');
    const packed = run('pack', {GITHUB_OUTPUT: join(directory, 'output')});
    assert.equal(packed.status, 0, packed.stderr);
    const expected = await digest();
    assert.equal(run('unpack', {EXPECTED_ARTIFACT_SHA: expected}).status, 0);
    await writeFile(join(directory, '.private/deploy-artifact.tar.gz'), 'tampered');
    assert.match(run('unpack', {EXPECTED_ARTIFACT_SHA: expected}).stderr, /digest mismatch/);
    await writeFile(join(directory, 'unsafe.mjs'), 'throw new Error("untrusted")');
    const archive = file => spawnSync('tar', ['-czf', '.private/deploy-artifact.tar.gz', file], {cwd: directory, env: {...process.env, COPYFILE_DISABLE: '1'}});
    assert.equal(archive('unsafe.mjs').status, 0);
    assert.match(run('unpack', {EXPECTED_ARTIFACT_SHA: await digest()}).stderr, /Unexpected artifact path/);
    await symlink('../../../unsafe.mjs', join(directory, 'apps/web/dist/link'));
    assert.equal(archive('apps/web/dist').status, 0);
    assert.match(run('unpack', {EXPECTED_ARTIFACT_SHA: await digest()}).stderr, /links are not permitted/);
  } finally {await rm(directory, {recursive: true, force: true});}
});
