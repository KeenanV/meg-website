import { createHash } from 'node:crypto';
import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook';

const hash = value => createHash('sha256').update(value).digest('hex');
const contentTypes = new Set(['siteSettings', 'about', 'linksPage', 'book', 'blogPost', 'newsItem']);
const MAX_BODY = 32_768;

// This bounded, process-local limit is a second layer behind reCAPTCHA, not a billing cap.
function limiter(now) {
  const counters = new Map();
  return (key, limit, duration) => {
    const time = now();
    for (const [id, counter] of counters) if (counter.expires <= time) counters.delete(id);
    let counter = counters.get(key);
    if (!counter) {
      if (counters.size >= 2048) return false;
      counter = { count: 0, expires: time + duration };
      counters.set(key, counter);
    }
    return ++counter.count <= limit;
  };
}

async function readBody(request) {
  if (Number(request.headers['content-length']) > MAX_BODY) throw new Error('body-limit');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('body-limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function contactData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { name, email, message, token, requestId } = value;
  if (![name, email, message, token, requestId].every(item => typeof item === 'string')) return null;
  const clean = { name: name.trim(), email: email.trim(), message: message.trim(), token, requestId };
  if (!clean.name || clean.name.length > 120 || /[\r\n\x00-\x1f]/.test(clean.name)
    || clean.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean.email)
    || /[\x00-\x1f\x7f]/.test(clean.email)
    || !clean.message || clean.message.length > 5000 || clean.message.includes('\0')
    || !token || token.length > 8192
    || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(requestId)) return null;
  return clean;
}

export function createHandler({ config, assess, sendEmail, dispatch, now = Date.now, log = console.info }) {
  const allow = limiter(now);
  const deliveries = new Map();
  const pending = new Map();

  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: status >= 200 && status < 300, message }));
    };
    let path;
    try { path = new URL(request.url, 'http://localhost').pathname; }
    catch { return reply(400, 'Invalid request URL.'); }
    if (path === '/health' && request.method === 'GET') return reply(200, 'Ready');
    if (!['/contact', '/sanity-hook'].includes(path)) return reply(404, 'Not found');

    if (path === '/contact') {
      const origin = request.headers.origin;
      response.setHeader('Vary', 'Origin');
      if (!config.origins.includes(origin)) return reply(403, 'This origin is not allowed.');
      response.setHeader('Access-Control-Allow-Origin', origin);
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'POST');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.setHeader('Access-Control-Max-Age', '600');
        response.writeHead(204);
        return response.end();
      }
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return reply(405, 'Use POST.');
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return reply(415, 'Use JSON.');

    let raw;
    try { raw = await readBody(request); }
    catch { return reply(413, 'The message is too large.'); }

    try {
      if (path === '/sanity-hook') {
        if (!config.webhookSecret || !config.githubToken) return reply(503, 'Publishing is not configured.');
        if (!await isValidSignature(raw, request.headers[SIGNATURE_HEADER_NAME], config.webhookSecret)) {
          return reply(401, 'Invalid signature.');
        }
        let event;
        try { event = JSON.parse(raw); } catch { return reply(400, 'Invalid JSON.'); }
        if (!event || event.projectId !== config.sanityProject || event.dataset !== config.sanityDataset
          || !contentTypes.has(event.type) || typeof event.id !== 'string'
          || event.id.startsWith('drafts.') || event.id.startsWith('versions.')
          || !['create', 'update', 'delete'].includes(event.operation)) return reply(400, 'Unexpected content event.');

        // Dedupe the signed body, not an unauthenticated request header. Only remember accepted dispatches.
        const key = hash(raw);
        for (const [id, expiry] of deliveries) if (expiry <= now()) deliveries.delete(id);
        if (!deliveries.has(key)) {
          if (!pending.has(key)) {
            pending.set(key, (async () => {
              await dispatch();
              if (deliveries.size >= 2048) deliveries.delete(deliveries.keys().next().value);
              deliveries.set(key, now() + 86_400_000);
            })().finally(() => pending.delete(key)));
          }
          await pending.get(key);
        }
        return reply(202, 'Rebuild queued.');
      }

      if (!config.resendKey || !config.recipient || !config.sender || !config.siteKey) return reply(503, 'Messaging is not available yet.');
      if (!allow('requests', 60, 60_000)) return reply(429, 'Please wait a minute before trying again.');
      let data;
      try { data = JSON.parse(raw); } catch { return reply(400, 'Invalid JSON.'); }
      if (typeof data?.website === 'string' && data.website) return reply(200, 'Message received.');
      const contact = contactData(data);
      if (!contact) return reply(400, 'Please check your name, email address, and message.');
      if (!allow(`email:${hash(contact.email.toLowerCase())}`, 3, 600_000)
        || !allow('assessments', 30, 3_600_000)) return reply(429, 'Please wait a little before sending another message.');
      const assessment = await assess(contact.token, request.headers['user-agent'] ?? '');
      if (assessment?.tokenProperties?.valid !== true
        || assessment.tokenProperties.action !== 'contact'
        || assessment.tokenProperties.hostname !== new URL(request.headers.origin).hostname
        || typeof assessment.riskAnalysis?.score !== 'number'
        || assessment.riskAnalysis.score < 0.5) return reply(403, 'The spam check could not verify this request. Please try again.');

      const payload = {
        from: config.sender,
        to: [config.recipient],
        reply_to: contact.email,
        subject: 'New website contact message',
        text: `Name: ${contact.name}\nEmail: ${contact.email}\n\n${contact.message}`,
      };
      // Resend also deduplicates retries across restarts and revisions. Include content so edits are new messages.
      await sendEmail(payload, `contact-${hash(JSON.stringify([contact.requestId, payload]))}`);
      return reply(200, 'Your message has been sent. Thank you!');
    } catch {
      // Never log request bodies, addresses, provider responses, or credentials.
      log(JSON.stringify({ severity: 'ERROR', event: path === '/contact' ? 'contact_delivery_failed' : 'publication_dispatch_failed' }));
      return reply(503, path === '/contact'
        ? 'Your message could not be sent. Your text is still here; please try again shortly.'
        : 'The rebuild could not be queued. Retry this delivery.');
    }
  };
}
