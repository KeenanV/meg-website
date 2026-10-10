import {mkdir, mkdtemp, cp, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {accountFlags, gcloud, run} from './cloud-cli.mjs';

const dataset = process.argv[2];
if (!['staging', 'production'].includes(dataset)) throw new Error('Choose staging or production');
const project = dataset === 'staging' ? 'megvandeusen-staging' : 'megvandeusen-website';
const builder = dataset === 'staging' ? 'staging-builder' : 'backend-builder';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (!process.argv.includes('--worker-only')) run('npm', ['run', 'build', '--prefix', 'apps/web'], {env: {...process.env, EDITORIAL_PREVIEW: 'true',
  PUBLIC_SANITY_PROJECT_ID: 'ap0mc9ri', PUBLIC_SANITY_DATASET: dataset}});
await mkdir('.private', {recursive: true, mode: 0o700});
async function context(kind) {
  const directory = await mkdtemp(path.join(root, `.private/editorial-${kind}-`));
  const files = ['apps/backend/package.json', 'apps/backend/package-lock.json', 'apps/backend/src'];
  if (kind === 'preview') files.push('apps/web/package.json', 'apps/web/package-lock.json', 'apps/web/dist-preview', 'apps/web/editorial');
  else files.push('shared', ...['package.json', 'package-lock.json', 'sanity.config.ts', 'sanity.cli.ts', 'structure.ts', 'presentation.ts', 'schemas', 'components'].map(file => 'apps/studio/' + file));
  for (const file of files) {await mkdir(path.dirname(path.join(directory, file)), {recursive: true}); await cp(file, path.join(directory, file), {recursive: true});}
  await cp(`editorial/${kind}.Dockerfile`, path.join(directory, 'Dockerfile'));
  await writeFile(path.join(directory, '.gcloudignore'), 'node_modules\n**/node_modules\n.env*\n**/.env*\n*.log\n');
  return directory;
}
const common = ['--region=us-west1', `--project=${project}`, ...accountFlags, '--quiet'];
const build = `--build-service-account=projects/${project}/serviceAccounts/${builder}@${project}.iam.gserviceaccount.com`;
if (!process.argv.includes('--worker-only')) run(gcloud, ['run', 'deploy', 'editorial-preview', `--source=${await context('preview')}`, ...common, build,
  `--service-account=editorial-preview@${project}.iam.gserviceaccount.com`, ...(process.env.CI ? [] : ['--allow-unauthenticated']),
  `--set-env-vars=GOOGLE_CLOUD_PROJECT=${project},PUBLIC_SANITY_DATASET=${dataset},NODE_ENV=production`,
  '--set-secrets=SANITY_PREVIEW_TOKEN=sanity-preview-token:latest,PREVIEW_SESSION_SECRET=preview-session-secret:latest',
  '--min=0', '--max=1', '--max-instances=1', '--concurrency=10', '--cpu=1', '--memory=512Mi', '--timeout=60s', '--no-cpu-boost']);
if (dataset === 'staging' && !process.argv.includes('--preview-only')) {
  // Job source deployment does not accept a custom build identity. Build the
  // image explicitly, using the same restricted builder as the staging site.
  const directory = await context('sync');
  const image = `us-west1-docker.pkg.dev/${project}/cloud-run-source-deploy/studio-content-sync:${Date.now()}`;
  const cacheImage = `us-west1-docker.pkg.dev/${project}/cloud-run-source-deploy/studio-content-sync:latest`;
  await writeFile(path.join(directory, 'build.json'), JSON.stringify({
    steps: [{name: 'gcr.io/cloud-builders/docker', args: ['pull', cacheImage], allowFailure: true},
      {name: 'gcr.io/cloud-builders/docker', args: ['build', '--cache-from', cacheImage, '-t', image, '-t', cacheImage, '.']}],
    images: [image, cacheImage], options: {logging: 'CLOUD_LOGGING_ONLY'},
  }));
  run(gcloud, ['builds', 'submit', directory, ...common, `--config=${path.join(directory, 'build.json')}`,
    `--service-account=projects/${project}/serviceAccounts/${builder}@${project}.iam.gserviceaccount.com`]);
  run(gcloud, ['run', 'jobs', 'deploy', 'studio-content-sync', `--image=${image}`, ...common,
    '--service-account=studio-content-sync@megvandeusen-staging.iam.gserviceaccount.com',
    '--set-env-vars=GOOGLE_CLOUD_PROJECT=megvandeusen-staging,SANITY_STUDIO_DATASET=staging',
    '--set-secrets=SANITY_PRODUCTION_READ_TOKEN=sanity-production-read-token:latest,SANITY_STAGING_WRITE_TOKEN=sanity-staging-write-token:latest,GITHUB_WORKFLOW_TOKEN=github-workflow-token:latest',
    '--tasks=1', '--parallelism=1', '--max-retries=0', '--task-timeout=15m', '--cpu=1', '--memory=2Gi']);
}
