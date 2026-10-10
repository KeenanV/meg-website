import {randomUUID} from 'node:crypto';
import {GoogleAuth} from 'google-auth-library';
import {localBurst, firestoreAllowance} from './abuse.mjs';

export function studioSyncApi({db, authorize, origins, launch, allowance = firestoreAllowance(db, 'studio-sync')}) {
  const burst = localBurst(30, 60_000);
  async function failedLaunch(ref, expected) {
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      // A lost API response does not prove the job never started. Never
      // overwrite a worker's newer status after it has claimed the operation.
      if (current?.status === expected) tx.update(ref, {status: 'failed',
        message: 'Worker startup was not confirmed. Check status before creating a new plan.', finished: Date.now()});
    });
  }
  async function launchReviewed(ref, id, phase, expected) {
    try {await launch(id, phase);}
    catch (error) {
      await failedLaunch(ref, expected);
      throw error;
    }
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Vary', 'Origin');
    const reply = (status, body) => {res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body));};
    if (!origins.includes(req.headers.origin)) return reply(403, {message: 'Use the signed-in Studio.'});
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sanity-Token');
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(405, {message: 'Use JSON POST.'});
    if (!burst()) return reply(429, {message: 'Please wait a moment.'});
    try {
      const owner = await authorize(req.headers['x-sanity-token']);
      if (!owner) return reply(403, {message: 'An authorized Sanity editor session is required.'});
      let raw = '';
      for await (const chunk of req) {raw += chunk.toString(); if (Buffer.byteLength(raw) > 2048) return reply(413, {message: 'Request too large.'});}
      let body;
      try {body = JSON.parse(raw);} catch {return reply(400, {message: 'Invalid request.'});}
      const route = new URL(req.url, 'http://localhost').pathname;
      if (route === '/api/studio/sync/plan') {
        if (!['update', 'reset'].includes(body.mode)) return reply(400, {message: 'Choose update or reset.'});
        if (!await allowance([{key: 'plans:' + owner, limit: 10, duration: 3_600_000}, {key: 'plans-global', limit: 20, duration: 3_600_000}])) return reply(429, {message: 'The hourly sync allowance has been reached. Please try later.'});
        const id = randomUUID();
        await db.collection('studioSyncRuns').doc(id).create({owner, mode: body.mode, status: 'queued', created: Date.now(), message: 'Preparing change summary…'});
        await launchReviewed(db.collection('studioSyncRuns').doc(id), id, 'plan', 'queued');
        return reply(202, {id});
      }
      if (!/^[a-f0-9-]{36}$/.test(body.id || '')) return reply(400, {message: 'Invalid sync ID.'});
      const ref = db.collection('studioSyncRuns').doc(body.id);
      const run = (await ref.get()).data();
      if (!run || run.owner !== owner) return reply(404, {message: 'Sync not found.'});
      if (route === '/api/studio/sync/status') {
        const {status, mode, plan, message, created, finished, result} = run;
        return reply(200, {id: body.id, status, mode, plan, message, created, finished, result});
      }
      if (route === '/api/studio/sync/apply') {
        const expected = run.mode === 'reset' ? 'RESET STAGING' : 'UPDATE STAGING';
        if (body.confirmation !== expected) return reply(400, {message: `Type ${expected} to confirm.`});
        await db.runTransaction(async tx => {
          const current = (await tx.get(ref)).data();
          if (current.status !== 'review' || current.plan?.conflicts.length || current.created < Date.now() - 3_600_000) throw new Error('Plan is stale or has conflicts');
          tx.update(ref, {status: 'queued-apply', message: 'Waiting to copy the reviewed content…'});
        });
        await launchReviewed(ref, body.id, 'apply', 'queued-apply');
        return reply(202, {id: body.id});
      }
      return reply(404, {message: 'Not found.'});
    } catch {return reply(503, {message: 'Unable to start or read this sync. Refresh its status; create a new plan if needed.'});}
  };
}

export function cloudSyncLauncher() {
  const auth = new GoogleAuth({scopes: ['https://www.googleapis.com/auth/cloud-platform']});
  return async (id, phase) => {
    const client = await auth.getClient();
    await client.request({url: 'https://run.googleapis.com/v2/projects/megvandeusen-staging/locations/us-west1/jobs/studio-content-sync:run',
      method: 'POST', data: {overrides: {containerOverrides: [{args: ['src/sync-job.mjs', id, phase]}]}}});
  };
}
