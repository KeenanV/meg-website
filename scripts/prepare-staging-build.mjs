import {spawnSync} from 'node:child_process';
import {mkdir, cp, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const environment = {...process.env, SITE_URL: 'https://staging.megvandeusen.com', PUBLIC_SITE_ENV: 'staging',
  PUBLIC_SANITY_PROJECT_ID: 'ap0mc9ri', PUBLIC_SANITY_DATASET: 'staging',
  PUBLIC_CONTACT_API_URL: '', PUBLIC_RECAPTCHA_SITE_KEY: ''};
for (const args of [['run', 'build', '--prefix', 'apps/web'], ['run', 'check:build', '--prefix', 'apps/web']]) {
  const result = spawnSync('npm', args, {env: environment, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
const home = await readFile(path.join(root, 'apps/web/dist/index.html'), 'utf8');
if (!home.includes('Private test environment') || !home.includes('name="robots" content="noindex"')) throw new Error('Not a staging build');
// Use a fresh, explicitly assembled context: no env files, local passwords, or recordings.
const {mkdtemp} = await import('node:fs/promises');
await mkdir('.private', {recursive: true, mode: 0o700});
const context = await mkdtemp(path.join(root, '.private/staging-build-'));
for (const file of ['package.json', 'package-lock.json', 'src']) await cp(path.join(root, 'apps/backend', file), path.join(context, file), {recursive: true});
await cp(path.join(root, 'apps/web/dist'), path.join(context, 'site'), {recursive: true});
await cp(path.join(root, 'staging/Dockerfile'), path.join(context, 'Dockerfile'));
await writeFile(path.join(context, '.gcloudignore'), 'node_modules\n.env*\n*.log\n');
await mkdir('.firebase/staging-empty', {recursive: true});
await writeFile('.private/staging-build-path.txt', context, {mode: 0o600});
console.log('Staging-only build context:', context);
