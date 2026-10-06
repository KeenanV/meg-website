import {readFile} from 'node:fs/promises';
import {accountFlags, gcloud, run} from './cloud-cli.mjs';

const project = 'megvandeusen-staging';
const flags = ['--project='+project, '--region=us-west1', ...accountFlags];
const token = run(gcloud, ['auth', 'print-access-token', ...accountFlags],
  {stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8'}).trim();
async function request(method, route, body) {
  const response = await fetch('https://firebasehosting.googleapis.com/v1beta1/'+route, {
    method, headers: {Authorization: 'Bearer '+token, 'x-goog-user-project': project, 'Content-Type': 'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Hosting ${method} failed (${response.status})`);
  return response.json();
}
const {hosting} = JSON.parse(await readFile(new URL('../firebase.staging.json', import.meta.url), 'utf8'));
if (hosting.site !== project || JSON.stringify(hosting.ignore) !== '["**/*"]'
  || JSON.stringify(hosting.rewrites) !== '[{"source":"**","run":{"serviceId":"staging-website","region":"us-west1","pinTag":true}}]') {
  throw new Error('Staging must serve only the authenticated proxy');
}
const revision = run(gcloud, ['run', 'services', 'describe', 'staging-website', ...flags,
  '--format=value(status.latestReadyRevisionName)'], {stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8'}).trim();
if (!/^staging-website-\d+-[a-z0-9]+$/.test(revision)) throw new Error('Unexpected staging revision');
const tag = 'hosting-'+revision.slice('staging-website-'.length);
run(gcloud, ['run', 'services', 'update-traffic', 'staging-website', ...flags, '--update-tags='+tag+'='+revision, '--quiet']);
const config = {rewrites: [{glob: '**', run: {serviceId: 'staging-website', region: 'us-west1', tag}}],
  headers: hosting.headers.map(item => ({glob: item.source, headers: Object.fromEntries(item.headers.map(h => [h.key, h.value]))}))};
const version = await request('POST', `sites/${project}/versions`, {config});
await request('PATCH', version.name+'?updateMask=status', {status: 'FINALIZED'});
const release = await request('POST', `sites/${project}/releases?versionName=${version.name}`, {message: 'Private staging proxy; no public static files'});
console.log('Released staging:', release.name);
