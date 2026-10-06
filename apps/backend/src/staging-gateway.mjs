import {createHash, timingSafeEqual} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {localBurst} from './abuse.mjs';

const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'};

// Staging-only outer gate: require the separate randomly generated reviewer
// credential on every request, including assets, APIs, and direct run.app URLs.
export function stagingGateway({directory, basicHash, resources, studio, publishing}) {
  const root = path.resolve(directory);
  const failedReviewerAttempts = localBurst(60, 60_000);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Vary', 'Authorization, Cookie');
    const reply = (code, body) => { res.writeHead(code, {'Content-Type': 'text/plain; charset=utf-8'}); res.end(body); };
    if (!/^[a-f0-9]{64}$/.test(basicHash || '')) return reply(503, 'Staging access is not configured.');
    try {
      // Studio uploads use independently verified Sanity editor authentication.
      // Preflight exposes no content; all operations enforce editor membership.
      const uploadRoute = new URL(req.url, 'http://localhost').pathname;
      if (studio && ['/api/studio/uploads/start', '/api/studio/uploads/finish'].includes(uploadRoute)) return await studio(req, res);
      // Sanity cannot use the reviewer login. This route verifies its own HMAC
      // signature and the exact dataset before it can dispatch a build.
      if (publishing && uploadRoute === '/sanity-hook') return await publishing(req, res);
      const authorization = req.headers.authorization || '';
      const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
      const value = basic && authorization.length <= 1024 ? Buffer.from(basic[1], 'base64') : Buffer.alloc(0);
      const supplied = createHash('sha256').update(value).digest();
      if (!timingSafeEqual(supplied, Buffer.from(basicHash, 'hex'))) {
        if (!failedReviewerAttempts()) {
          res.setHeader('Retry-After', '60');
          return reply(429, 'Too many requests. Please try again shortly.');
        }
        res.setHeader('WWW-Authenticate', 'Basic realm="Meg website staging", charset="UTF-8"');
        return reply(401, 'Private staging environment. Reviewer credentials required.');
      }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (publishing && pathname === '/contact' && ['POST', 'OPTIONS'].includes(req.method)) return await publishing(req, res);
      if (pathname.startsWith('/api/resources/')) return await resources(req, res);
      if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Method not allowed.');
      // Deny dotfiles and malformed paths before filesystem resolution.
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) return reply(404, 'Not found.');
      if (pathname === '/robots.txt') return reply(200, 'User-agent: *\nDisallow: /\n');
      let filename = path.resolve(root, '.' + pathname);
      if (filename !== root && !filename.startsWith(root + path.sep)) return reply(404, 'Not found.');
      let info;
      try { info = await stat(filename); } catch { /* Custom 404 below. */ }
      if (info?.isDirectory()) {
        filename = path.join(filename, 'index.html');
        try { info = await stat(filename); } catch { info = undefined; }
      }
      let status = 200;
      if (!info?.isFile()) {
        filename = path.join(root, '404.html');
        info = await stat(filename); status = 404;
      }
      res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
      if (!info) return reply(404, 'Not found.');
      res.setHeader('Content-Length', info.size);
      res.writeHead(status);
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(filename), res);
    } catch {
      if (res.headersSent) res.destroy();
      else reply(503, 'Staging is temporarily unavailable.');
    }
  };
}
