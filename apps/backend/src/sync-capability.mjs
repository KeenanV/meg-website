import {createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify} from 'node:crypto';
import {Timestamp} from '@google-cloud/firestore';

export const SYNC_BROKER_ORIGIN = 'https://website-backend-348807509213.us-west1.run.app';
export const SYNC_TARGET_ORIGIN = 'https://megvandeusen-staging.web.app';
export const SYNC_PATH = /^\/api\/studio\/sync\/(plan|status|apply)$/;
export const STUDIO_CAPABILITY_PATH = /^\/api\/studio\/(sync\/(plan|status|apply)|uploads\/(start|finish))$/;
const lifetime = 30_000;
const digest = body => createHash('sha256').update(body).digest('hex');

// Staging has only the public key. It cannot manufacture an editor identity or
// turn a captured status request into an apply/reset request.
export function syncSigner(encodedKey, now = Date.now) {
  const key = createPrivateKey({key: Buffer.from(encodedKey, 'base64'), format: 'der', type: 'pkcs8'});
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Invalid sync signing key');
  return (owner, path, body) => {
    if (!/^[a-f0-9]{64}$/.test(owner) || !STUDIO_CAPABILITY_PATH.test(path)) throw new Error('Invalid Studio request');
    const iat = now();
    const payload = Buffer.from(JSON.stringify({iss: SYNC_BROKER_ORIGIN, aud: SYNC_TARGET_ORIGIN,
      sub: owner, method: 'POST', path, body: digest(body), iat, exp: iat + lifetime, jti: randomUUID()})).toString('base64url');
    return payload + '.' + sign(null, Buffer.from(payload), key).toString('base64url');
  };
}

export function syncVerifier(encodedKey, claim, now = Date.now) {
  const key = createPublicKey({key: Buffer.from(encodedKey, 'base64'), format: 'der', type: 'spki'});
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Invalid sync verification key');
  return async (token, path, body) => {
    try {
      if (typeof token !== 'string' || token.length > 2048) return null;
      const [payload, signature, extra] = token.split('.');
      if (!payload || !signature || extra || !verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64url'))) return null;
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const time = now();
      if (data.iss !== SYNC_BROKER_ORIGIN || data.aud !== SYNC_TARGET_ORIGIN || data.method !== 'POST'
        || !STUDIO_CAPABILITY_PATH.test(path) || data.path !== path || data.body !== digest(body)
        || !/^[a-f0-9]{64}$/.test(data.sub) || !/^[a-f0-9-]{36}$/.test(data.jti)
        || !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp)
        || data.iat > time + 5000 || data.exp <= time || data.exp - data.iat !== lifetime) return null;
      return await claim(data.jti, data.exp) ? data.sub : null;
    } catch { return null; }
  };
}

export function firestoreSyncClaim(db) {
  return async (id, expires) => {
    try {
      await db.collection('studioSyncCapabilities').doc(id).create({cleanupAt: Timestamp.fromMillis(expires + 60_000)});
      return true;
    } catch (error) {
      if (error.code === 6 || error.code === 'ALREADY_EXISTS') return false;
      throw error; // Verifier fails closed on storage errors.
    }
  };
}

export function syncAuthorization({capability}) {
  return async (token, req, raw) => {
    if (req.headers.origin === SYNC_BROKER_ORIGIN) {
      if (token || !capability) return null;
      return capability(req.headers['x-sync-capability'], new URL(req.url, SYNC_TARGET_ORIGIN).pathname, raw);
    }
    // Even a legitimate Dashboard session can also authorize production. Do
    // not accept human credentials at staging, regardless of browser Origin.
    return null;
  };
}
