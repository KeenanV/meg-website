import {mkdirSync, writeFileSync} from 'node:fs';
import {accountFlags, gcloud, run} from './cloud-cli.mjs';

const options = {stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8'};
export function cloudJson(args) {
  return JSON.parse(run(gcloud, [...args, ...accountFlags, '--format=json'], options));
}

// Normal releases require LATEST at 100%. Intentional canaries/rollbacks must be
// completed explicitly by an operator; deployment never silently overrides them.
export function assertServingRelease(service, revision, expected = {}) {
  const status = service.status || {};
  const name = status.latestReadyRevisionName;
  const active = (status.traffic || []).filter(item => item.percent > 0);
  if (!name || status.latestCreatedRevisionName !== name || active.length !== 1
    || active[0].percent !== 100 || active[0].latestRevision !== true || active[0].revisionName !== name) {
    throw new Error('Release traffic must route 100% to the latest ready revision; resolve pinned/canary traffic explicitly.');
  }
  const image = revision?.status?.imageDigest;
  const templateImage = service.spec?.template?.spec?.containers?.[0]?.image;
  if (revision?.metadata?.name !== name || !/@sha256:[a-f0-9]{64}$/.test(image || '')
    || templateImage !== image || (expected.revision && expected.revision !== name)
    || (expected.image && expected.image !== image)) {
    throw new Error('Serving revision/image does not match the intended release.');
  }
  if (revision.status.conditions?.find(item => item.type === 'Ready')?.status !== 'True') {
    throw new Error('Serving revision is not ready.');
  }
  return {revision: name, image};
}

export function verifyService(project, name, expected) {
  const flags = ['--project='+project, '--region=us-west1'];
  const service = cloudJson(['run', 'services', 'describe', name, ...flags]);
  const revision = cloudJson(['run', 'revisions', 'describe', service.status.latestReadyRevisionName, ...flags]);
  const identity = assertServingRelease(service, revision, expected);
  mkdirSync('.private/release-evidence', {recursive: true});
  writeFileSync(`.private/release-evidence/${project}-${name}.json`, JSON.stringify({project, service: name, ...identity}, null, 2)+'\n');
  console.log(`Verified ${project}/${name}: ${identity.revision} ${identity.image}`);
  return identity;
}

export function verifyBuildStorage(project) {
  for (const bucket of [project+'_cloudbuild', `run-sources-${project}-us-west1`]) {
    const settings = cloudJson(['storage', 'buckets', 'describe', 'gs://'+bucket]);
    if (settings.uniform_bucket_level_access !== true || settings.public_access_prevention !== 'enforced') {
      throw new Error(`Build source bucket ${bucket} lacks UBLA/PAP; run scripts/harden-build-storage.py before deployment.`);
    }
  }
}

export function deployService(project, name, args) {
  verifyService(project, name);
  verifyBuildStorage(project);
  // Capture the deployment result, not an unrelated later latest revision.
  const deployed = cloudJson(['run', 'deploy', name, ...args]);
  const revision = deployed.status?.latestCreatedRevisionName;
  const image = deployed.spec?.template?.spec?.containers?.[0]?.image;
  if (!revision || !/@sha256:[a-f0-9]{64}$/.test(image || '')) throw new Error('Deployment did not return an immutable release identity.');
  return verifyService(project, name, {revision, image});
}

export function assertHostingRelease(release, project, service, tag) {
  const rewrites = release?.version?.config?.rewrites;
  if (release?.type !== 'DEPLOY' || !release.version.name?.startsWith(`sites/${project}/versions/`)
    || rewrites?.length !== 1 || rewrites[0].glob !== '**'
    || rewrites[0].run?.serviceId !== service || rewrites[0].run?.region !== 'us-west1'
    || rewrites[0].run?.tag !== tag) throw new Error('Active Hosting release does not match the intended protected revision.');
}
