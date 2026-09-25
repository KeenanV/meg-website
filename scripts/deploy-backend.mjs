import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('npm', ['run', 'check', '--prefix', 'apps/backend']);
run('npm', ['test', '--prefix', 'apps/backend']);
// Keep existing Cloud Run environment and pinned secret versions. Do not change recipients during code deploys.
run('gcloud', [
  'run', 'deploy', 'website-backend', '--source=apps/backend', '--region=us-west1',
  '--project=megvandeusen-website', '--account=keenanvandeusen@gmail.com',
  '--service-account=website-backend@megvandeusen-website.iam.gserviceaccount.com',
  '--build-service-account=projects/megvandeusen-website/serviceAccounts/backend-builder@megvandeusen-website.iam.gserviceaccount.com',
  '--min=0', '--max=1', '--max-instances=1', '--concurrency=8', '--cpu=1', '--memory=256Mi',
  '--timeout=30s', '--cpu-throttling', '--no-cpu-boost', '--quiet',
]);
