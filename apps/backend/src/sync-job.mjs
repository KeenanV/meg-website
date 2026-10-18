import {Firestore} from '@google-cloud/firestore';
import {planSync, applySync, CONTENT_TYPES} from './content-sync.mjs';
import {syncStorage} from './sync-storage.mjs';
import {claimSync} from './sync-queue.mjs';

if (process.env.GOOGLE_CLOUD_PROJECT !== 'megvandeusen-staging') throw new Error('Sync worker is staging-only');
if (process.argv.length !== 2) throw new Error('Sync worker does not accept command arguments');
const db = new Firestore({projectId: 'megvandeusen-staging'});
// Drain requests whose initial launch raced with another execution's lock.
for (let claimed; (claimed = await claimSync(db));) await execute(claimed);

async function execute(claimed) {
  const {id, phase, ref, lock, run} = claimed;
  let applied = false, verified = false;
  const progress = async message => {await ref.update({message});};
  try {
    const adapter = syncStorage({id, db, targetToken: process.env.SANITY_STAGING_WRITE_TOKEN});
    if (phase === 'plan') {
      const [source, target, baseline] = await Promise.all([adapter.readSource(), adapter.readTarget(), adapter.readBaseline()]);
      const plan = planSync({source, target, baseline, mode: run.mode});
      await adapter.saveSnapshot(source.filter(doc => !doc._id.startsWith('drafts.') && !doc._id.startsWith('versions.')));
      await ref.update({status: 'review', plan, message: plan.conflicts.length ? 'Conflicts found. Nothing has been changed.' : 'Review the changes before copying content.'});
    } else {
      const snapshot = await adapter.loadSnapshot();
      const commit = adapter.commit;
      adapter.commit = async args => {
        // Remember old revisions (deletion webhooks) before the transaction.
        const batch = db.batch();
        for (const doc of args.expected.filter(doc => CONTENT_TYPES.includes(doc._type))) batch.set(db.collection('studioSyncRevisions').doc(doc._rev), {run: id});
        await batch.commit();
        applied = true; // Fail closed even if a mutation times out with an unknown outcome.
        await commit(args);
        const after = await adapter.readTarget();
        const next = db.batch();
        for (const doc of after.filter(doc => CONTENT_TYPES.includes(doc._type))) next.set(db.collection('studioSyncRevisions').doc(doc._rev), {run: id});
        await next.commit();
      };
      const result = await applySync({plan: run.plan, snapshot, adapter, progress});
      verified = true;
      await ref.update({status: 'copied', result, message: 'Content verified. Queuing one staging deployment…'});
    }
  } catch (error) {
    // Only known engine messages are safe for Studio. Never expose API responses.
    const safe = ['Content changed after review.', 'Resolve conflicts', 'Content exceeds', 'Resolve staging content-release'];
    const message = safe.some(prefix => error.message?.startsWith(prefix)) ? error.message
      : applied ? 'Content was applied, but a follow-up check failed. Staging remains protected; review the backup before recovery.'
        : 'Sync stopped before content replacement. Check the job configuration or validation results, then create a fresh plan.';
    await ref.update({status: 'failed', message, finished: Date.now()});
    process.exitCode = 1;
  } finally {
    if (verified || !applied) {
      // Drain suppressed publications and release atomically. Dispatch only
      // after releasing so the queued deployment can acquire its own lease.
      const pending = await db.runTransaction(async tx => {
        const state = (await tx.get(lock)).data();
        if (state?.id !== id) throw new Error('Sync lease changed');
        tx.set(lock, {id, maintenance: false, expires: 0, pendingPublications: false});
        return state.pendingPublications === true;
      });
      if (verified || pending) {
        try {
          await dispatch();
          if (verified) await ref.update({status: 'complete', finished: Date.now(), message: 'Content synchronized. Staging deployment queued; the website updates when it finishes.'});
        } catch {
          await ref.update({status: 'failed', finished: Date.now(), message: 'Staging content is safe, but its deployment could not be queued. Retry a refresh or ask the site administrator to deploy staging.'});
          process.exitCode = 1;
        }
      }
    }
  }
}
async function dispatch() {
  const response = await fetch('https://api.github.com/repos/KeenanV/meg-website/actions/workflows/deploy-staging.yml/dispatches', {
    method: 'POST', headers: {Authorization: `Bearer ${process.env.GITHUB_WORKFLOW_TOKEN}`, 'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json', 'User-Agent': 'meg-studio-sync'},
    body: JSON.stringify({ref: 'staging', inputs: {deployment_type: 'content'}}), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Staging dispatch failed');
}
