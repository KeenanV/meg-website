import {createServer} from 'node:http';
import {createServiceHandler} from './service-handler.mjs';
import {productionGateway} from './production-gateway.mjs';
import {cloudResources} from './resources-cloud.mjs';
import {Storage} from '@google-cloud/storage';
import {Firestore} from '@google-cloud/firestore';
import {firestoreAllowance} from './abuse.mjs';
import {bucketUploads, sanityEditor, studioUploadHandler} from './studio-upload.mjs';

const project = 'megvandeusen-website';
if (process.env.GOOGLE_CLOUD_PROJECT !== project) throw new Error('Production server requires the production project');
let resources, studio;
if (process.env.RESOURCES_ACCESS) {
  const credentials = JSON.parse(process.env.RESOURCES_ACCESS);
  resources = cloudResources({project, bucketName: 'megvandeusen-website-resources', credentials,
    signingSecret: credentials.hash, siteKey: process.env.RECAPTCHA_SITE_KEY,
    sanity: {project: 'ap0mc9ri', dataset: 'production'},
    origins: ['https://megvandeusen.com', 'https://www.megvandeusen.com'],
  });
  const db = new Firestore({projectId: project});
  studio = studioUploadHandler({dataset: 'production',
    origins: ['http://localhost:3333', 'https://megvandeusen.sanity.studio'],
    authorize: token => sanityEditor(token, 'ap0mc9ri'),
    uploads: bucketUploads(new Storage({projectId: project}).bucket('megvandeusen-website-resources'), db),
    allow: firestoreAllowance(db, 'studio'),
  });
}
const handler = productionGateway({service: createServiceHandler(), resources, studio});

const server = createServer({ maxHeaderSize: 16_384, requestTimeout: 20_000, headersTimeout: 15_000 }, handler);
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close());
