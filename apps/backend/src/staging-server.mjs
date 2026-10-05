import {createServer} from 'node:http';
import {cloudResources} from './resources-cloud.mjs';
import {stagingGateway} from './staging-gateway.mjs';
import {Storage} from '@google-cloud/storage';
import {Firestore} from '@google-cloud/firestore';
import {firestoreAllowance} from './abuse.mjs';
import {bucketUploads, sanityEditor, studioUploadHandler} from './studio-upload.mjs';

if (process.env.GOOGLE_CLOUD_PROJECT !== 'megvandeusen-staging') throw new Error('Staging server requires the staging project.');
const secret = JSON.parse(process.env.STAGING_ACCESS || '{}');
const resources = cloudResources({project: 'megvandeusen-staging', bucketName: 'megvandeusen-staging-resources',
  ...(process.env.PRIVATE_CATALOG === 'sanity' ? {sanity: {project: 'ap0mc9ri', dataset: 'staging'}} : {}),
  credentials: secret.resources, origins: ['https://staging.megvandeusen.com', 'https://megvandeusen-staging.web.app', 'https://megvandeusen-staging.firebaseapp.com']});
const db = new Firestore({projectId: 'megvandeusen-staging'});
const studio = studioUploadHandler({dataset: 'staging',
  origins: ['http://localhost:3333', 'http://localhost:3334', 'https://megvandeusen-staging.sanity.studio'],
  authorize: token => sanityEditor(token, 'ap0mc9ri'),
  uploads: bucketUploads(new Storage({projectId: 'megvandeusen-staging'}).bucket('megvandeusen-staging-resources'), db),
  allow: firestoreAllowance(db, 'studio'),
});
const handler = stagingGateway({directory: new URL('../site', import.meta.url).pathname, basicHash: secret.basicHash, resources, studio});
const server = createServer({maxHeaderSize: 16_384, requestTimeout: 20_000, headersTimeout: 15_000}, handler);
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close());
