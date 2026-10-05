import {accountFlags, gcloud, run} from './cloud-cli.mjs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
run('npm', ['run', 'check', '--prefix', 'apps/backend']);
run('npm', ['test', '--prefix', 'apps/backend']);
// Contact throttling must persist across instances; never deploy without storage.
run(gcloud, ['firestore', 'databases', 'describe', '--database=(default)',
  '--project=megvandeusen-website', ...accountFlags, '--format=value(name)', '--quiet']);
// Keep existing Cloud Run environment and pinned secret versions. Do not change recipients during code deploys.
run(gcloud, [
  'run', 'deploy', 'website-backend', '--source=apps/backend', '--region=us-west1',
  '--project=megvandeusen-website', ...accountFlags,
  '--service-account=website-backend@megvandeusen-website.iam.gserviceaccount.com',
  '--build-service-account=projects/megvandeusen-website/serviceAccounts/backend-builder@megvandeusen-website.iam.gserviceaccount.com',
  '--min=0', '--max=1', '--max-instances=1', '--concurrency=8', '--cpu=1', '--memory=256Mi',
  '--timeout=30s', '--cpu-throttling', '--no-cpu-boost', '--quiet',
]);
