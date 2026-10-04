import {createServer} from 'node:http';
import {cloudResources} from './resources-cloud.mjs';
import {stagingGateway} from './staging-gateway.mjs';

if (process.env.GOOGLE_CLOUD_PROJECT !== 'megvandeusen-staging') throw new Error('Staging server requires the staging project.');
const secret = JSON.parse(process.env.STAGING_ACCESS || '{}');
const resources = cloudResources({project: 'megvandeusen-staging', bucketName: 'megvandeusen-staging-resources',
  credentials: secret.resources, origins: ['https://staging.megvandeusen.com', 'https://megvandeusen-staging.web.app', 'https://megvandeusen-staging.firebaseapp.com']});
const handler = stagingGateway({directory: new URL('../site', import.meta.url).pathname, basicHash: secret.basicHash, resources});
const server = createServer({maxHeaderSize: 16_384, requestTimeout: 20_000, headersTimeout: 15_000}, handler);
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close());
