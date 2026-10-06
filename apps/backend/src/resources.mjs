import {randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {memoryResourcesState} from './resources-state.mjs';
import {localBurst} from './abuse.mjs';
const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
// Firebase Hosting forwards only this cookie to Cloud Run rewrites.
const COOKIE = '__session';
const TTL = 8 * 60 * 60 * 1000;

export async function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return {salt, hash};
}

export function createResourcesHandler({credentials, store, allowOrigin, secureCookies = true, now = Date.now,
  state = memoryResourcesState(now), attemptKey = req => req.socket.remoteAddress || 'unknown', challenge, verifyCaptcha}) {
  let verifying = 0;
  const burst = localBurst(30, 60_000, now);
  const rawCookie = req => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  function token(req) {
    // Reject forged cloud cookies before doing a Firestore lookup.
    const value = challenge ? challenge.reader(rawCookie(req)) : rawCookie(req);
    return value && /^[a-f0-9]{64}$/.test(value) ? digest(value) : '';
  }
  function cookie(value, maxAge) {
    return `${COOKIE}=${value}; Path=/api/resources; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const json = (status, body) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!credentials || !/^[a-f0-9]{128}$/.test(credentials.hash) || !credentials.salt) return json(503, {message: 'Resources are not configured yet.'});
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !allowOrigin(req.headers.origin))) return json(403, {message: 'Request not allowed.'});
      if (req.method === 'POST' && !allowOrigin(req.headers.origin)) return json(403, {message: 'Request not allowed.'});
      const sessionKey = token(req);
      if (path === '/api/resources/challenge' && req.method === 'GET') {
        // Do not replace a reader's authenticated session on a retry/second tab.
        if (challenge && !sessionKey && !challenge.identify(rawCookie(req))) res.setHeader('Set-Cookie', cookie(challenge.issue(), 900));
        return json(200, {ok: true});
      }
      if (path === '/api/resources/login' && req.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(415, {message: 'Use JSON.'});
        if (!burst()) {res.setHeader('Retry-After', '60'); return json(429, {message: 'Please try again shortly.'});}
        const client = challenge ? (challenge.identify(rawCookie(req)) || sessionKey) : attemptKey(req);
        if (!client) return json(403, {message: 'Please refresh the page and try again.'});
        const maxBody = verifyCaptcha ? 8192 : 2048;
        if (Number(req.headers['content-length']) > maxBody) return json(413, {message: 'Request too large.'});
        const chunks = [];
        let bytes = 0;
        for await (const part of req) {
          bytes += part.length;
          if (bytes > maxBody) return json(413, {message: 'Request too large.'});
          chunks.push(part);
        }
        let password, captchaToken;
        try { ({password, token: captchaToken} = JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { return json(400, {message: 'Invalid request.'}); }
        if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) return json(400, {message: 'Enter the password from your book.'});
        if (verifyCaptcha && (typeof captchaToken !== 'string' || !captchaToken || captchaToken.length > 6000)) return json(400, {message: 'Please complete the spam check and try again.'});
        // Reserve the durable global/browser allowance BEFORE assessing CAPTCHA
        // or hashing passwords; invalid CAPTCHA also consumes that allowance.
        if (verifying >= 4 || !await state.attempt(client)) {
          res.setHeader('Retry-After', '900'); return json(429, {message: 'Too many attempts. Please try again in 15 minutes.'});
        }
        if (verifyCaptcha && !await verifyCaptcha(captchaToken, req.headers['user-agent'])) return json(403, {message: 'The spam check could not verify this request. Please try again.'});
        if (verifying >= 4) return json(429, {message: 'Please try again shortly.'});
        let computed;
        verifying++;
        try { computed = await scrypt(password, credentials.salt, 64); } finally { verifying--; }
        if (!timingSafeEqual(computed, Buffer.from(credentials.hash, 'hex'))) return json(401, {message: 'That password wasn’t recognized. Please try again.'});
        await state.clearAttempts(client);
        const value = randomBytes(32).toString('hex');
        const expires = now() + TTL;
        await state.rotate(sessionKey, digest(value), expires);
        res.setHeader('Set-Cookie', cookie(challenge ? challenge.session(value) : value, TTL / 1000));
        return json(200, {expires});
      }
      if (path === '/api/resources/logout' && req.method === 'POST') {
        await state.revoke(sessionKey);
        res.setHeader('Set-Cookie', cookie('', 0));
        return json(200, {ok: true});
      }
      const session = sessionKey && await state.get(sessionKey);
      if (!session || session.expires <= now()) return json(401, {message: 'Please unlock Resources to continue.'});
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, {message: 'Method not allowed.'});
      if (path === '/api/resources/catalog' && req.method === 'GET') {
        return json(200, {items: await store.catalog(), expires: session.expires});
      }
      const match = /^\/api\/resources\/(audio|image)\/([a-f0-9]{64})$/.exec(path);
      if (!match) return json(404, {message: 'Not found.'});
      const asset = await store.asset(match[2], match[1]);
      if (!asset) return json(404, {message: 'Not found.'});
      let start = 0, end = asset.size - 1, status = 200;
      const range = req.headers.range;
      if (range) {
        const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
        const fail = () => { res.setHeader('Content-Range', `bytes */${asset.size}`); return json(416, {message: 'Invalid range.'}); };
        if (!parts || !parts[1] && !parts[2]) return fail();
        if (!parts[1]) {
          const suffix = Number(parts[2]);
          if (!Number.isSafeInteger(suffix) || suffix <= 0) return fail();
          start = Math.max(0, asset.size - suffix);
        } else {
          start = Number(parts[1]); end = parts[2] ? Math.min(Number(parts[2]), end) : end;
        }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= asset.size) return fail();
        status = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${asset.size}`);
      }
      res.setHeader('Accept-Ranges', 'bytes');
      if (req.method === 'GET' && asset.redirect) {
        res.removeHeader('Content-Range');
        res.writeHead(302, {Location: await asset.redirect()});
        return res.end();
      }
      res.setHeader('Content-Type', match[1] === 'audio' ? 'audio/mpeg' : 'image/jpeg');
      res.setHeader('Content-Length', end - start + 1);
      res.writeHead(status);
      if (req.method === 'HEAD') return res.end();
      await asset.send(res, {start, end});
    } catch {
      if (res.headersSent) res.destroy();
      else json(503, {message: 'Resources are temporarily unavailable. Please try again.'});
    }
  };
}
