import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWebsiteConfig } from './hosting-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = 'megvandeusen-website';
// The repository variable remains unset/preview until the approved launch.
const channel = process.env.HOSTING_RELEASE_CHANNEL || 'preview';
const config = createWebsiteConfig(channel);
const check = spawnSync('npm', ['run', 'check:build', '--prefix', 'apps/web'], { stdio: 'inherit' });
if (check.error) throw check.error;
if (check.status !== 0) process.exit(check.status ?? 1);
mkdirSync('.firebase', { recursive: true });
const configPath = path.join(root, '.firebase', `${channel}-config.json`);
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
const command = channel === 'live'
  ? ['deploy', '--only', 'hosting']
  : ['hosting:channel:deploy', 'launch-review', '--expires', '7d', '--no-authorized-domains'];
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'), ...command,
  '--project', 'megvandeusen-website', '--config', configPath, '--non-interactive',
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
