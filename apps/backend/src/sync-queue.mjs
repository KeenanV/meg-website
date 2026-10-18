// The web gateway can request a fixed worker execution, never a command or env
// override. Claims and the deployment/sync lock are acquired in one transaction.
export function queuedPhase(run, now = Date.now()) {
  if (!run || typeof run.owner !== 'string' || !run.owner || !['update', 'reset'].includes(run.mode)
    || !Number.isSafeInteger(run.created) || run.created > now || run.created < now - 3_600_000) return null;
  if (run.status === 'queued') return 'plan';
  if (run.status !== 'queued-apply' || run.approvedBy !== run.owner
    || !Number.isSafeInteger(run.approvedAt) || run.approvedAt < run.created || run.approvedAt > now
    || !run.plan || !Array.isArray(run.plan.conflicts) || run.plan.conflicts.length) return null;
  return 'apply';
}

export async function claimSync(db, now = Date.now) {
  const lock = db.collection('studioOperations').doc('sync');
  return db.runTransaction(async tx => {
    const state = (await tx.get(lock)).data();
    if (state?.maintenance || state?.expires > now()) return null;
    const pending = await tx.get(db.collection('studioSyncRuns').where('status', 'in', ['queued', 'queued-apply']).limit(50));
    const candidates = pending.docs.map(doc => ({ref: doc.ref, id: doc.id, run: doc.data()}));
    const valid = candidates.filter(item => /^[a-f0-9-]{36}$/.test(item.id) && queuedPhase(item.run, now()));
    const selected = valid.sort((a, b) => a.run.created - b.run.created)[0];
    // Expire invalid queue entries so they cannot fill the bounded queue forever.
    for (const item of candidates) if (!valid.includes(item)) tx.update(item.ref, {
      status: 'failed', finished: now(), message: 'Queued request expired or lacks a valid approval. Create a new plan.',
    });
    if (!selected) return null;
    const phase = queuedPhase(selected.run, now());
    tx.set(lock, {id: selected.id, expires: now() + 30 * 60_000, maintenance: phase === 'apply', pendingPublications: false});
    tx.update(selected.ref, {status: phase === 'plan' ? 'planning' : 'applying'});
    return {...selected, phase, lock};
  });
}
