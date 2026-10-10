import {createHmac, timingSafeEqual} from 'node:crypto';

export const PREVIEW_COOKIE = '__Host-meg-preview';
export const PREVIEW_TTL = 30 * 60_000;
export function previewSessions(secret, dataset, now = Date.now) {
  if (!secret || secret.length < 32 || !['production', 'staging'].includes(dataset)) throw new Error('Preview credentials required');
  const sign = value => createHmac('sha256', secret).update(value).digest('base64url');
  return {
    issue() {
      const value = Buffer.from(JSON.stringify({dataset, expires: now() + PREVIEW_TTL})).toString('base64url');
      return `${value}.${sign(value)}`;
    },
    verify(cookie = '') {
      try {
        const value = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(PREVIEW_COOKIE + '='))?.slice(PREVIEW_COOKIE.length + 1);
        if (!value || value.length > 1024) return false;
        const [body, signature, extra] = value.split('.');
        const expected = Buffer.from(sign(body));
        const actual = Buffer.from(signature || '');
        if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
        const data = JSON.parse(Buffer.from(body, 'base64url').toString());
        return data.dataset === dataset && data.expires > now() && data.expires <= now() + PREVIEW_TTL;
      } catch { return false; }
    },
  };
}

export function previewRedirect(value = '/') {
  // Only navigate within this renderer; exclude auth endpoints and protocol-relative URLs.
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)
    || value.startsWith('/api/')) return '/';
  const url = new URL(value, 'https://preview.invalid');
  return url.origin === 'https://preview.invalid' ? url.pathname + url.search : '/';
}
