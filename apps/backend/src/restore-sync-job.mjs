// Operator-only recovery entrypoint; the Studio API cannot dispatch this command.
import {Firestore} from '@google-cloud/firestore';
import {randomUUID} from 'node:crypto';
import {syncStorage} from './sync-storage.mjs';
import {CONTENT_TYPES, contentDocument, contentHash} from './content-sync.mjs';

const [id, confirmation] = process.argv.slice(2);
if (process.env.GOOGLE_CLOUD_PROJECT !== 'megvandeusen-staging' || !/^[a-f0-9-]{36}$/.test(id || '') || confirmation !== 'RESTORE_STAGING') throw new Error('Explicit staging restore confirmation required');
const db = new Firestore({projectId: 'megvandeusen-staging'});
const lock = db.collection('studioOperations').doc('sync');
const recoveryId = randomUUID();
const create = identifier => syncStorage({id: identifier, db, sourceToken: process.env.SANITY_PRODUCTION_READ_TOKEN, targetToken: process.env.SANITY_STAGING_WRITE_TOKEN});
const adapter = create(id);
let acquired = false;
async function restore() {
  await db.runTransaction(async tx => {
    const state = (await tx.get(lock)).data();
    if (state?.expires > Date.now()) throw new Error('An operation is still running');
    tx.set(lock, {id: recoveryId, maintenance: true, expires: Date.now() + 30 * 60_000});
  });
  acquired = true;
  const current = await adapter.readTarget();
  await create(recoveryId).backup(current);
  const backup = await adapter.loadBackup();
  const restored = [];
  for (const doc of backup) restored.push(await adapter.restoreMedia(contentDocument(doc)));
  const replacements = restored.filter(doc => CONTENT_TYPES.includes(doc._type));
  const ids = new Set(replacements.map(doc => doc._id));
  await adapter.commit({replacements, remove: current.filter(doc => CONTENT_TYPES.includes(doc._type) && !ids.has(doc._id)).map(doc => doc._id), expected: current});
  const after = (await adapter.readTarget()).filter(doc => CONTENT_TYPES.includes(doc._type));
  if (after.length !== replacements.length || after.some(doc => contentHash(doc) !== contentHash(replacements.find(item => item._id === doc._id)))) throw new Error('Restore verification failed');
  await adapter.saveBaseline({});
  await lock.set({id: recoveryId, maintenance: false, expires: 0, pendingPublications: false});
  console.log('Staging backup restored and verified. Run the staging content deployment.');
}
try {await restore();} catch {
  console.error(acquired ? 'Restore failed. Staging remains protected. Inspect the operation and backup before retrying.' : 'Restore could not acquire the staging lock.');
  process.exitCode = 1;
}
