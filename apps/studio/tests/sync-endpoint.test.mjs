import test from 'node:test';
import assert from 'node:assert/strict';
import {syncEndpoint, uploadEndpoint} from '../sync-endpoint.mjs';
test('both Studios keep potentially global editor sessions inside the production trust boundary', () => {
  assert.equal(new URL(syncEndpoint('production')).hostname, 'website-backend-348807509213.us-west1.run.app');
  assert.equal(new URL(syncEndpoint('staging')).hostname, 'website-backend-348807509213.us-west1.run.app');
  assert.equal(new URL(syncEndpoint('staging')).pathname, '/api/studio/staging/sync');
  assert.equal(new URL(uploadEndpoint('staging')).hostname, 'website-backend-348807509213.us-west1.run.app');
  assert.equal(new URL(uploadEndpoint('staging')).pathname, '/api/studio/staging/uploads');
  assert.equal(new URL(uploadEndpoint('production')).hostname, 'megvandeusen.com');
  assert.throws(() => syncEndpoint('other'));
  assert.throws(() => uploadEndpoint('other'));
});
