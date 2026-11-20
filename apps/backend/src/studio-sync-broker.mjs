import {localBurst} from './abuse.mjs';
import {SYNC_BROKER_ORIGIN, SYNC_TARGET_ORIGIN, SYNC_PATH, STUDIO_CAPABILITY_PATH} from './sync-capability.mjs';

// An Origin selects a fixed project only after Sanity has verified the user.
// Neither a supplied dataset nor a URL can select a privileged destination.
const productionOrigins = ['https://megvandeusen.sanity.studio', 'http://localhost:3333'];
const stagingOrigins = ['https://meg-website-staging.sanity.studio', 'http://localhost:3334'];
function routeFor(path, origin) {
  if (SYNC_PATH.test(path) && productionOrigins.includes(origin)) return {path, project: 'ap0mc9ri'};
  if (path.startsWith('/api/studio/staging/') && stagingOrigins.includes(origin)) {
    const target = path.replace('/api/studio/staging/', '/api/studio/');
    if (STUDIO_CAPABILITY_PATH.test(target)) return {path: target, project: '77uvsyo1'};
  }
  return null;
}

function validBody(path, body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') return false;
  const fields = path.endsWith('/uploads/start') ? ['dataset', 'size', 'contentType']
    : path.endsWith('/uploads/finish') ? ['dataset', 'id']
    : path.endsWith('/plan') ? ['mode'] : path.endsWith('/apply') ? ['id', 'confirmation'] : ['id'];
  if (Object.keys(body).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(body, key))) return false;
  if (path.includes('/uploads/')) {
    if (body.dataset !== 'staging') return false;
    if (path.endsWith('/start')) return Number.isSafeInteger(body.size) && body.size >= 4
      && body.size <= 100 * 1024 * 1024 && body.contentType === 'audio/mpeg';
  }
  return fields.every(key => typeof body[key] === 'string')
    && (!fields.includes('id') || /^[0-9a-f-]{36}$/.test(body.id))
    && (!fields.includes('mode') || ['update', 'reset'].includes(body.mode));
}

export function studioSyncBroker({authorize, issue, allow, request = fetch}) {
  const burst = localBurst(60, 60_000);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Vary', 'Origin');
    const reply = (status, body) => {res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body));};
    const path = new URL(req.url, SYNC_BROKER_ORIGIN).pathname;
    const route = routeFor(path, req.headers.origin);
    if (!route) return reply(403, {message: 'Use the matching Studio environment.'});
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sanity-Token');
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(405, {message: 'Use JSON POST.'});
    if (!issue) return reply(503, {message: 'Staging editor actions are not configured yet.'});
    if (!burst()) return reply(429, {message: 'Please wait a moment.'});
    try {
      if (req.headers['x-sync-capability']) return reply(403, {message: 'Use an editor session.'});
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {bytes += chunk.length; if (bytes > 2048) return reply(413, {message: 'Request too large.'}); chunks.push(chunk);}
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try {body = JSON.parse(raw);} catch {return reply(400, {message: 'Invalid request.'});}
      if (!validBody(route.path, body)) return reply(400, {message: 'Invalid Studio action fields.'});
      const owner = await authorize(req.headers['x-sanity-token'], route.project);
      if (!owner) return reply(403, {message: 'An authorized editor session for this Studio project is required.'});
      if (!await allow([{key: 'broker:' + owner, limit: 120, duration: 60_000},
        {key: 'broker-global', limit: 300, duration: 60_000}])) return reply(429, {message: 'Please wait before refreshing again.'});
      // Only these explicit headers cross environments. Never copy browser
      // headers, cookies, Sanity credentials, or a caller-supplied destination.
      const upstream = await request(SYNC_TARGET_ORIGIN + route.path, {method: 'POST', redirect: 'error',
        headers: {Origin: SYNC_BROKER_ORIGIN, 'Content-Type': 'application/json', 'X-Sync-Capability': issue(owner, route.path, raw)},
        body: raw, signal: AbortSignal.timeout(20_000)});
      if (upstream.status >= 500) return reply(503, {message: 'Staging is temporarily unavailable. Refresh status before retrying.'});
      const result = await upstream.json();
      return reply(upstream.status, result);
    } catch {return reply(503, {message: 'Unable to contact staging. Refresh status before creating another plan.'});}
  };
}
