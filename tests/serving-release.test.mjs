import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {assertHostingRelease, assertServingRelease} from '../scripts/verify-serving-release.mjs';

const image = 'us-west1-docker.pkg.dev/project/repository/service@sha256:'+'a'.repeat(64);
function fixture() {
  return {
    service: {spec: {template: {spec: {containers: [{image}]}}}, status: {
      latestCreatedRevisionName: 'service-00002-new', latestReadyRevisionName: 'service-00002-new',
      traffic: [{revisionName: 'service-00002-new', latestRevision: true, percent: 100}],
    }},
    revision: {metadata: {name: 'service-00002-new'}, status: {imageDigest: image, conditions: [{type: 'Ready', status: 'True'}]}},
  };
}
test('release accepts ready latest traffic and exact intended immutable image', () => {
  const {service, revision} = fixture();
  assert.deepEqual(assertServingRelease(service, revision, {revision: 'service-00002-new', image}), {revision: 'service-00002-new', image});
});
test('green deployment cannot hide a pinned old revision or split traffic', () => {
  for (const traffic of [
    [{revisionName: 'service-00001-old', percent: 100}],
    [{revisionName: 'service-00002-new', percent: 100}],
    [{revisionName: 'service-00002-new', latestRevision: true, percent: 90}, {revisionName: 'service-00001-old', percent: 10}],
  ]) {
    const {service, revision} = fixture(); service.status.traffic = traffic;
    assert.throws(() => assertServingRelease(service, revision), /traffic/);
  }
});
test('unready, mismatched and concurrently replaced releases fail closed', () => {
  for (const mutate of [
    f => {f.service.status.latestCreatedRevisionName = 'service-00003-pending';},
    f => {f.revision.status.imageDigest = image.replace(/a/g, 'b');},
    f => {f.revision.status.conditions[0].status = 'False';},
  ]) {
    const f = fixture(); mutate(f); assert.throws(() => assertServingRelease(f.service, f.revision));
  }
  const f = fixture();
  assert.throws(() => assertServingRelease(f.service, f.revision, {revision: 'service-00001-old'}), /intended/);
  assert.throws(() => assertServingRelease(f.service, f.revision, {image: image+'different'}), /intended/);
});
test('Hosting must pin the intended authenticated service and revision tag', () => {
  const release = {type: 'DEPLOY', version: {name: 'sites/staging/versions/123', config: {rewrites: [{glob: '**', run: {serviceId: 'gateway', region: 'us-west1', tag: 'hosting-00002-new'}}]}}};
  assert.doesNotThrow(() => assertHostingRelease(release, 'staging', 'gateway', 'hosting-00002-new'));
  assert.throws(() => assertHostingRelease(release, 'staging', 'gateway', 'hosting-00001-old'));
  release.version.config.rewrites.push({glob: '/public', destination: '/index.html'});
  assert.throws(() => assertHostingRelease(release, 'staging', 'gateway', 'hosting-00002-new'));
});
test('retired migration fails before importing Sanity or reading a session', () => {
  const result = spawnSync(process.execPath, ['apps/studio/scripts/seed-private-recordings.mjs', '--apply'], {encoding: 'utf8', env: {}});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /retired/);
  assert.equal(result.stdout, '');
});
