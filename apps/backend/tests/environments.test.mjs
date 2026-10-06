import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentTarget, createServiceHandler} from '../src/service-handler.mjs';

test('publishing destinations are bound to the cloud project and dataset', () => {
  assert.deepEqual(deploymentTarget('megvandeusen-staging', 'staging'), {dataset: 'staging', branch: 'staging', workflow: 'deploy-staging.yml'});
  assert.deepEqual(deploymentTarget('megvandeusen-website', 'production'), {dataset: 'production', branch: 'master', workflow: 'deploy.yml'});
  assert.throws(() => deploymentTarget('megvandeusen-staging', 'production'));
  assert.throws(() => deploymentTarget('megvandeusen-website', 'staging'));
  assert.throws(() => deploymentTarget('unknown', 'production'));
  assert.throws(() => createServiceHandler({GOOGLE_CLOUD_PROJECT: 'megvandeusen-staging', SANITY_DATASET: 'staging', CONTACT_RECIPIENT: 'someone@example.com'}));
});
