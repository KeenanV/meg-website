import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = 'megvandeusen-website';

// CI authenticates only after building/testing, keeping its short-lived token fresh.
const check = spawnSync('npm', ['run', 'check:build', '--prefix', 'apps/web'], { stdio: 'inherit' });
if (check.error) throw check.error;
if (check.status !== 0) process.exit(check.status ?? 1);

const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
config.hosting.public = path.join(root, config.hosting.public);
config.hosting.headers.push({
  source: '**', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
});
mkdirSync('.firebase', { recursive: true });
const configPath = path.join(root, '.firebase', 'preview-config.json');
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

// Deliberately preview-only until the explicit launch review and DNS hold are lifted.
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'),
  'hosting:channel:deploy', 'launch-review', '--expires', '7d',
  '--project', 'megvandeusen-website', '--config', configPath,
  '--non-interactive', '--no-authorized-domains',
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
