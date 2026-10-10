import {spawnSync} from 'node:child_process';
import {accountFlags, gcloud} from './cloud-cli.mjs';

const action = process.argv[2];
if (!['acquire', 'release'].includes(action) || !process.env.GITHUB_RUN_ID) throw new Error('Use from the staging deployment workflow');
const id = 'deployment-' + process.env.GITHUB_RUN_ID;
const result = spawnSync(gcloud, ['auth', 'print-access-token', ...accountFlags], {encoding: 'utf8'});
if (result.status !== 0) throw new Error('Cannot authenticate deployment lock');
const authorization = 'Bearer ' + result.stdout.trim();
const base = 'https://firestore.googleapis.com/v1/projects/megvandeusen-staging/databases/(default)/documents';
const name = 'projects/megvandeusen-staging/databases/(default)/documents/studioOperations/sync';
const response = await fetch(base + '/studioOperations/sync', {headers: {Authorization: authorization}});
if (!response.ok && response.status !== 404) throw new Error('Cannot read staging operation lock');
const document = response.ok ? await response.json() : null;
const fields = document?.fields || {};
if (action === 'release' && fields.id?.stringValue !== id) process.exit(0);
if (action === 'acquire' && (fields.maintenance?.booleanValue || Number(fields.expires?.integerValue) > Date.now()) && fields.id?.stringValue !== id) {
  throw new Error('A Studio content refresh is running. Retry this deployment after it finishes.');
}
const committed = await fetch(base + ':commit', {method: 'POST', headers: {Authorization: authorization, 'Content-Type': 'application/json'},
  body: JSON.stringify({writes: [{update: {name, fields: {
    id: {stringValue: id}, expires: {integerValue: String(action === 'acquire' ? Date.now() + 50 * 60_000 : 0)},
    maintenance: {booleanValue: false}, pendingPublications: {booleanValue: false},
  }}, currentDocument: document ? {updateTime: document.updateTime} : {exists: false}}]})});
if (!committed.ok) throw new Error('Staging operation changed concurrently; retry the deployment');
console.log('Staging deployment lock ' + (action === 'acquire' ? 'acquired' : 'released'));
