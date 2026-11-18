import test from 'node:test';
import assert from 'node:assert/strict';
import {syncEndpoint} from '../sync-endpoint.mjs';
test('production editor requests stay in the production trust boundary', () => {
  assert.equal(new URL(syncEndpoint('production')).hostname, 'website-backend-348807509213.us-west1.run.app');
  assert.equal(new URL(syncEndpoint('staging')).hostname, 'megvandeusen-staging.web.app');
  assert.throws(() => syncEndpoint('other'));
});
