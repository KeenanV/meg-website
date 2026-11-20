import {createServer} from 'node:http';
import {createServiceHandler} from './service-handler.mjs';
import {cloudResources} from './resources-cloud.mjs';
import {stagingGateway} from './staging-gateway.mjs';
import {Storage} from '@google-cloud/storage';
import {Firestore} from '@google-cloud/firestore';
import {firestoreAllowance} from './abuse.mjs';
import {bucketUploads, studioUploadHandler} from './studio-upload.mjs';
import {studioSyncApi, cloudSyncLauncher} from './studio-sync-api.mjs';
import {SYNC_BROKER_ORIGIN, syncVerifier, firestoreSyncClaim, syncAuthorization} from './sync-capability.mjs';

if (process.env.GOOGLE_CLOUD_PROJECT !== 'megvandeusen-staging') throw new Error('Staging server requires the staging project.');
const secret = JSON.parse(process.env.STAGING_ACCESS || '{}');
const resources = cloudResources({project: 'megvandeusen-staging', bucketName: 'megvandeusen-staging-resources',
  ...(process.env.PRIVATE_CATALOG === 'sanity' ? {sanity: {project: '77uvsyo1', dataset: 'staging'}} : {}),
  credentials: secret.resources, signingSecret: secret.resources.hash, siteKey: process.env.RECAPTCHA_SITE_KEY, origins: ['https://staging.megvandeusen.com', 'https://megvandeusen-staging.web.app', 'https://megvandeusen-staging.firebaseapp.com']});
const db = new Firestore({projectId: 'megvandeusen-staging'});
const authorizeStudio = syncAuthorization({capability: process.env.SYNC_BROKER_PUBLIC_KEY
  ? syncVerifier(process.env.SYNC_BROKER_PUBLIC_KEY, firestoreSyncClaim(db)) : null});
const studio = studioUploadHandler({dataset: 'staging',
  origins: [SYNC_BROKER_ORIGIN], capabilityOnly: true,
  authorize: authorizeStudio,
  uploads: bucketUploads(new Storage({projectId: 'megvandeusen-staging'}).bucket('megvandeusen-staging-resources'), db),
  allow: firestoreAllowance(db, 'studio'),
});
const sync = process.env.STUDIO_SYNC_ENABLED === 'true' ? studioSyncApi({db,
  origins: [SYNC_BROKER_ORIGIN],
  authorize: authorizeStudio,
  launch: cloudSyncLauncher(),
}) : undefined;
let maintenanceCache = {expires: 0, value: false};
async function maintenance() {
  if (!sync) return false;
  if (maintenanceCache.expires > Date.now()) return maintenanceCache.value;
  const state = (await db.collection('studioOperations').doc('sync').get()).data();
  maintenanceCache = {expires: Date.now() + 2000, value: state?.maintenance === true};
  return maintenanceCache.value;
}
const handler = stagingGateway({directory: new URL('../site', import.meta.url).pathname, basicHash: secret.basicHash, reviewers: secret.reviewers, resources, studio, sync, maintenance, publishing: createServiceHandler()});
const server = createServer({maxHeaderSize: 16_384, requestTimeout: 20_000, headersTimeout: 15_000}, handler);
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close());
