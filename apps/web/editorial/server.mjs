import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@sanity/client';
import {validatePreviewUrl} from '@sanity/preview-url-secret';
// Resolve Storage from the backend's dependency tree; the web package does not own it.
//noinspection ES6PreferShortImport
import {Storage} from '../../backend/src/preview-storage.mjs';
import {previewSessions, PREVIEW_COOKIE, PREVIEW_TTL, previewRedirect} from '../../backend/src/preview-session.mjs';
import {localBurst} from '../../backend/src/abuse.mjs';
import {privateAudioKey} from '../../backend/src/studio-upload.mjs';
import {privateCatalogQuery} from '../../backend/src/private-catalog.mjs';

import {reportOnlyCsp} from '../../backend/src/security-policy.mjs';
import {handoffHtml, handoffScriptHash, redeemPreviewSecret} from '../../backend/src/preview-handoff.mjs';

const dataset = process.env.PUBLIC_SANITY_DATASET;
const project = dataset === 'production' ? 'megvandeusen-website' : 'megvandeusen-staging';
if (!['staging', 'production'].includes(dataset) || process.env.GOOGLE_CLOUD_PROJECT !== project
  || !process.env.SANITY_PREVIEW_TOKEN) throw new Error('Invalid preview environment');
const sanityProjectId = dataset === 'staging' ? '77uvsyo1' : 'ap0mc9ri';
const client = createClient({projectId: sanityProjectId, dataset, apiVersion: '2025-10-26',
  token: process.env.SANITY_PREVIEW_TOKEN, useCdn: false, perspective: 'drafts'});
const sessions = previewSessions(process.env.PREVIEW_SESSION_SECRET, dataset);
const origins = [dataset === 'staging' ? 'https://meg-website-staging.sanity.studio' : 'https://megvandeusen.sanity.studio',
  ...(dataset === 'staging' ? ['http://localhost:3333', 'http://localhost:3334'] : [])];
// Dashboard embeds Studio, which embeds Preview. CSP checks every ancestor;
// these parent origins do not grant a preview session or widen the handoff gate.
const frameAncestors = [...origins, 'https://www.sanity.io', 'https://sanity.io'];
const cookie = value => `${PREVIEW_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${value ? PREVIEW_TTL / 1000 : 0}`;
const burst = localBurst(30, 60_000);
const bucket = new Storage({projectId: project}).bucket(`${project}-resources`);
const root = path.resolve(fileURLToPath(new URL('../dist-preview/client/', import.meta.url)));
const {handler} = await import('../dist-preview/server/entry.mjs');
const types = {'.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'};
async function catalog() {
  const items = await client.fetch(privateCatalogQuery);
  return items.map(item => ({...item, id: createHash('sha256').update(item._id).digest('hex')}));
}
const server = createServer({maxHeaderSize: 16384, requestTimeout: 20000}, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy-Report-Only', reportOnlyCsp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors.join(' ')}`);
  const reply = (code, text) => {res.writeHead(code, {'Content-Type': 'text/plain; charset=utf-8'}); res.end(text);};
  try {
    const url = new URL(req.url, 'https://preview.invalid');
    if (url.pathname === '/robots.txt') return reply(200, 'User-agent: *\nDisallow: /\n');
    if (url.pathname === '/api/resources/logout' && req.method === 'POST') {
      if (!sessions.verify(req.headers.cookie) || !req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return reply(403, 'Use the preview window.');
      res.setHeader('Set-Cookie', cookie(''));
      res.writeHead(200, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({ok: true}));
    }
    if (url.pathname === '/api/preview/enable') {
      if (req.method === 'GET') {
        // Sanity Presentation still uses query links. Sinks exclude those
        // requests; the bootstrap clears history before the one-time POST.
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'sha256-${handoffScriptHash}'; connect-src 'self'; base-uri 'none'; frame-ancestors ${frameAncestors.join(' ')}`);
        const html = sessions.verify(req.headers.cookie)
          ? handoffHtml.replace('<title>', '<meta name="preview-authorized" content="yes"><title>') : handoffHtml;
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); return res.end(html);
      }
      if (req.method !== 'POST') return reply(405, 'Use POST.');
      if (url.search) return reply(400, 'Use a clean handoff endpoint.');
      if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host
        || req.headers['content-type'] !== 'application/json') return reply(403, 'Use the preview window.');
      if (!burst()) return reply(429, 'Please wait before opening another preview.');
      let raw = '', size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) return reply(413, 'Handoff too large.');
        raw += chunk.toString('utf8');
      }
      let input;
      try {input = JSON.parse(raw);} catch {return reply(400, 'Invalid handoff.');}
      if (typeof input?.secret !== 'string' || input.secret.length < 16 || input.secret.length > 256) return reply(403, 'Invalid handoff.');
      // The SDK URL exists only in server memory; it never reaches request logs.
      const validationUrl = new URL('/api/preview/enable', 'https://preview.invalid');
      validationUrl.searchParams.set('sanity-preview-secret', input.secret);
      const result = await validatePreviewUrl(client, validationUrl.href);
      if (!result.isValid || !origins.includes(result.studioOrigin)
        || !await redeemPreviewSecret(bucket, dataset, input.secret)) return reply(403, 'Open a fresh Preview from your signed-in Studio.');
      res.setHeader('Set-Cookie', cookie(sessions.issue()));
      res.writeHead(200, {'Content-Type': 'application/json'});
      return res.end(JSON.stringify({path: previewRedirect(input.path)}));
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Preview is read-only.');
    if (url.pathname === '/api/preview/disable') {
      res.setHeader('Set-Cookie', cookie('')); return reply(200, 'Preview closed. You can return to Studio.');
    }
    if (!sessions.verify(req.headers.cookie)) return reply(401, 'Private draft preview. Use Preview in Studio, or choose Open private preview in the document actions menu for a fresh sign-in in this browser tab.');
    if (url.pathname.startsWith('/api/resources/')) {
      const items = await catalog();
      if (url.pathname === '/api/resources/catalog') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        return res.end(JSON.stringify({expires: Date.now() + PREVIEW_TTL, items: items.map(({id, title, excerpt, recordingType, customRecordingType, imageUrl}) =>
          ({id, title, excerpt, recordingType, customRecordingType, audioUrl: `/api/resources/audio/${id}`, imageUrl: imageUrl ? `/api/resources/image/${id}` : null}))}));
      }
      const match = /^\/api\/resources\/(audio|image)\/([a-f0-9]{64})$/.exec(url.pathname);
      const item = match && items.find(item => item.id === match[2]);
      if (!item) return reply(404, 'Recording not found.');
      let location;
      if (match[1] === 'image') {
        if (!item.imageUrl?.startsWith(`https://cdn.sanity.io/images/${sanityProjectId}/${dataset}/`)) return reply(404, 'No image.');
        location = item.imageUrl + '?w=840&h=525&fit=crop&auto=format';
      } else {
        if (!privateAudioKey.test(item.privateAudio?.objectKey) || !/^\d+$/.test(item.privateAudio?.generation)) return reply(404, 'No private audio.');
        [location] = await bucket.file(item.privateAudio.objectKey, {generation: item.privateAudio.generation}).getSignedUrl({
          version: 'v4', action: 'read', expires: Date.now() + 5 * 60_000,
          queryParams: {generation: item.privateAudio.generation}, responseType: 'audio/mpeg'});
      }
      res.writeHead(302, {Location: location}); return res.end();
    }
    // Authorize even static assets; no draft routes can bypass the outer gate.
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) return reply(404, 'Not found.');
    const filename = path.resolve(root, '.' + decoded);
    if (!filename.startsWith(root + path.sep)) {
      if (decoded !== '/') return reply(404, 'Not found.');
    } else {
      const info = await stat(filename).catch(() => null);
      if (info?.isFile()) {
        res.writeHead(200, {'Content-Type': types[path.extname(filename)] || 'application/octet-stream'});
        if (req.method === 'HEAD') return res.end();
        return await pipeline(createReadStream(filename), res);
      }
    }
    await handler(req, res);
  } catch {
    // Provider errors and URLs can include preview secrets. Never log them.
    if (res.headersSent) res.destroy(); else reply(503, 'Preview temporarily unavailable. Refresh from Studio.');
  }
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close());
