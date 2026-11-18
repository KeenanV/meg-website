import {localBurst} from './abuse.mjs';
import {SYNC_BROKER_ORIGIN, SYNC_TARGET_ORIGIN, SYNC_PATH} from './sync-capability.mjs';

export function studioSyncBroker({authorize, issue, allow, request = fetch}) {
  const burst = localBurst(60, 60_000);
  const origins = ['https://megvandeusen.sanity.studio', 'http://localhost:3333'];
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Vary', 'Origin');
    const reply = (status, body) => {res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body));};
    if (!origins.includes(req.headers.origin)) return reply(403, {message: 'Use production Studio.'});
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sanity-Token');
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(405, {message: 'Use JSON POST.'});
    if (!issue) return reply(503, {message: 'Staging refresh is not configured yet.'});
    if (!burst()) return reply(429, {message: 'Please wait a moment.'});
    try {
      const path = new URL(req.url, SYNC_BROKER_ORIGIN).pathname;
      if (!SYNC_PATH.test(path)) return reply(404, {message: 'Unknown sync action.'});
      let raw = '';
      for await (const chunk of req) {raw += chunk.toString(); if (Buffer.byteLength(raw) > 2048) return reply(413, {message: 'Request too large.'});}
      let body;
      try {body = JSON.parse(raw);} catch {return reply(400, {message: 'Invalid request.'});}
      if (!body || Array.isArray(body) || typeof body !== 'object') return reply(400, {message: 'Invalid request.'});
      const fields = path.endsWith('/plan') ? ['mode'] : path.endsWith('/apply') ? ['id', 'confirmation'] : ['id'];
      if (Object.keys(body).some(key => !fields.includes(key)) || fields.some(key => typeof body[key] !== 'string')) return reply(400, {message: 'Invalid sync fields.'});
      const owner = await authorize(req.headers['x-sanity-token']);
      if (!owner) return reply(403, {message: 'An authorized production editor session is required.'});
      if (!await allow([{key: 'broker:' + owner, limit: 120, duration: 60_000},
        {key: 'broker-global', limit: 300, duration: 60_000}])) return reply(429, {message: 'Please wait before refreshing again.'});
      // Only these explicit headers cross environments. Never copy browser
      // headers, cookies, Sanity credentials, or a caller-supplied destination.
      const upstream = await request(SYNC_TARGET_ORIGIN + path, {method: 'POST', redirect: 'error',
        headers: {Origin: SYNC_BROKER_ORIGIN, 'Content-Type': 'application/json', 'X-Sync-Capability': issue(owner, path, raw)},
        body: raw, signal: AbortSignal.timeout(20_000)});
      if (upstream.status >= 500) return reply(503, {message: 'Staging is temporarily unavailable. Refresh status before retrying.'});
      const result = await upstream.json();
      return reply(upstream.status, result);
    } catch {return reply(503, {message: 'Unable to contact staging. Refresh status before creating another plan.'});}
  };
}
