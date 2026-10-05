import {randomUUID, createHash} from 'node:crypto';
import {Timestamp} from '@google-cloud/firestore';
import {localBurst} from './abuse.mjs';

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const privateAudioKey = /^recordings\/[0-9a-f-]{36}\.mp3$/;
const hash = value => createHash('sha256').update(value).digest('hex');

// Never accept the user ID or role claimed by a browser. Sanity validates the
// presented personal session; project membership is checked independently.
export async function sanityEditor(token, project, request = fetch) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 8192 || /\s/.test(token)) return null;
  if (!/^[a-z0-9]+$/.test(project)) return null;
  const options = {headers: {Authorization: `Bearer ${token}`}, redirect: 'error', signal: AbortSignal.timeout(8000)};
  // Studio sessions are project-scoped; the global API rejects these tokens.
  const base = `https://${project}.api.sanity.io`;
  const response = await request(`${base}/v2025-10-26/users/me`, options);
  if (!response.ok) return null;
  const user = await response.json();
  if (typeof user.id !== 'string' || !user.id) return null;
  const access = await request(`${base}/v2025-10-26/projects/${project}`, options);
  if (!access.ok) return null;
  const membership = await access.json();
  const permitted = membership.id === project && membership.members?.some(item =>
    item.id === user.id && item.isRobot === false
    && item.roles?.some(role => ['administrator', 'editor', 'developer'].includes(role.name)));
  return permitted ? hash(user.id) : null;
}

export function studioUploadHandler({origins, dataset, authorize, uploads, allow}) {
  const burst = localBurst(20, 60_000);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const reply = (status, data) => {res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(data));};
    if (!origins.includes(req.headers.origin)) return reply(403, {message: 'Studio origin is not allowed.'});
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sanity-Token');
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'POST') return reply(405, {message: 'Use POST.'});
    if (!burst()) return reply(429, {message: 'Please wait before uploading again.'});
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, {message: 'Use JSON.'});
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4096) return reply(413, {message: 'Request too large.'});
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, {message: 'Invalid request.'}); }
      if (!input || input.dataset !== dataset) return reply(400, {message: 'Wrong Studio environment.'});
      const owner = await authorize(req.headers['x-sanity-token']);
      if (!owner) return reply(403, {message: 'An authorized Sanity editor session is required.'});
      const route = new URL(req.url, 'http://localhost').pathname;
      if (route === '/api/studio/uploads/start') {
        if (!Number.isSafeInteger(input.size) || input.size < 4 || input.size > MAX_AUDIO_BYTES
          || input.contentType !== 'audio/mpeg') return reply(400, {message: 'Choose an MP3 smaller than 100 MB.'});
        if (!await allow([{key: 'upload:' + owner, limit: 20, duration: 3_600_000},
          {key: 'uploads-global', limit: 50, duration: 86_400_000}])) return reply(429, {message: 'Upload allowance reached. Please try later.'});
        return reply(200, await uploads.start(owner, input.size));
      }
      if (route === '/api/studio/uploads/finish' && typeof input.id === 'string' && /^[0-9a-f-]{36}$/.test(input.id)) {
        const result = await uploads.finish(owner, input.id);
        return result ? reply(200, result) : reply(400, {message: 'Upload expired, incomplete, or invalid. Please upload again.'});
      }
      return reply(404, {message: 'Not found.'});
    } catch {
      // Never return/log upstream errors: they may contain signed URLs or tokens.
      return reply(503, {message: 'Private upload is temporarily unavailable.'});
    }
  };
}

export function bucketUploads(bucket, db, now = Date.now) {
  const tickets = db.collection('resourceUploads');
  return {
    async start(owner, size) {
      const id = randomUUID();
      const source = `incoming/${id}.mp3`;
      const expires = now() + 15 * 60_000;
      await tickets.doc(id).create({owner, size, source, expires: Timestamp.fromMillis(expires)});
      // Upload bytes go directly to GCS. The signed policy enforces an exact
      // object name, MIME type, and size; it grants no read or list permission.
      const [form] = await bucket.file(source).generateSignedPostPolicyV4({
        expires: now() + 5 * 60_000,
        fields: {'Content-Type': 'audio/mpeg', 'Cache-Control': 'private,no-store'},
        conditions: [['content-length-range', size, size]],
      });
      return {id, url: form.url, fields: form.fields};
    },
    async finish(owner, id) {
      const doc = tickets.doc(id);
      const ticket = (await doc.get()).data();
      if (!ticket || ticket.owner !== owner || ticket.expires.toMillis() <= now()) return null;
      if (ticket.result) return ticket.result;
      const source = bucket.file(ticket.source);
      const [metadata] = await source.getMetadata();
      if (Number(metadata.size) !== ticket.size || metadata.contentType !== 'audio/mpeg') return null;
      const version = bucket.file(ticket.source, {generation: metadata.generation});
      const [header] = await version.download({start: 0, end: 9});
      const mp3 = header.subarray(0, 3).toString() === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
      if (!mp3) return null;
      // Copy the verified generation out of the temporary upload prefix. A
      // replayed upload form cannot overwrite this finalized recording.
      const objectKey = `recordings/${id}.mp3`;
      const target = bucket.file(objectKey);
      try { await version.copy(target, {preconditionOpts: {ifGenerationMatch: 0}}); }
      catch (error) { if (Number(error.code) !== 412) throw error; }
      const [final] = await target.getMetadata();
      const result = {_type: 'privateRecording', objectKey, generation: String(final.generation), size: Number(final.size)};
      await doc.update({result});
      return result;
    },
  };
}
