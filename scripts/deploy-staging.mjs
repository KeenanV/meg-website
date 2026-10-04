import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const run = (command, args) => {
  const result = spawnSync(command, args, {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
};
if (!process.argv.includes('--prepared')) run(process.execPath, ['scripts/prepare-staging-build.mjs']);
const context = (await readFile('.private/staging-build-path.txt', 'utf8')).trim();
if (!context.startsWith(path.join(root, '.private/staging-build-'))) throw new Error('Invalid staging context');
run('npm', ['test', '--prefix', 'apps/backend']);
run('gcloud', ['run', 'deploy', 'staging-website', '--source='+context, '--region=us-west1',
  '--project=megvandeusen-staging', '--account=keenanvandeusen@gmail.com',
  '--service-account=staging-website@megvandeusen-staging.iam.gserviceaccount.com',
  '--build-service-account=projects/megvandeusen-staging/serviceAccounts/staging-builder@megvandeusen-staging.iam.gserviceaccount.com',
  '--set-env-vars=GOOGLE_CLOUD_PROJECT=megvandeusen-staging', '--set-secrets=STAGING_ACCESS=staging-access:1',
  '--min=0', '--max=1', '--max-instances=1', '--concurrency=20', '--cpu=1', '--memory=512Mi',
  '--timeout=60s', '--cpu-throttling', '--no-cpu-boost', '--allow-unauthenticated', '--quiet']);
run('/opt/homebrew/bin/python3.14', ['scripts/deploy-staging-hosting.py']);
