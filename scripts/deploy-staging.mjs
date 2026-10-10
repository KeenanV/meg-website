import {accountFlags, gcloud, run} from './cloud-cli.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (!process.argv.includes('--prepared')) run(process.execPath, ['scripts/prepare-staging-build.mjs',
  ...(process.argv.includes('--built') ? ['--built'] : [])]);
const context = (await readFile('.private/staging-build-path.txt', 'utf8')).trim();
if (!context.startsWith(path.join(root, '.private/staging-build-'))) throw new Error('Invalid staging context');
if (!process.argv.includes('--verified')) run('npm', ['test', '--prefix', 'apps/backend']);
run(gcloud, ['run', 'deploy', 'staging-website', '--source='+context, '--region=us-west1',
  '--project=megvandeusen-staging', ...accountFlags,
  '--service-account=staging-website@megvandeusen-staging.iam.gserviceaccount.com',
  '--build-service-account=projects/megvandeusen-staging/serviceAccounts/staging-builder@megvandeusen-staging.iam.gserviceaccount.com',
  '--update-env-vars=GOOGLE_CLOUD_PROJECT=megvandeusen-staging,PRIVATE_CATALOG=sanity,SANITY_PROJECT_ID=ap0mc9ri,SANITY_DATASET=staging,STUDIO_SYNC_ENABLED=true',
  '--min=0', '--max=1', '--max-instances=1', '--concurrency=20', '--cpu=1', '--memory=512Mi',
  '--timeout=60s', '--cpu-throttling', '--no-cpu-boost', '--quiet']);
run(process.execPath, ['scripts/deploy-staging-hosting.mjs']);
