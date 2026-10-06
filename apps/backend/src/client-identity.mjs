import {createHash, timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';

const digest = value => createHash('sha256').update(value).digest();

// Prepared for a future load balancer that OVERWRITES both headers and blocks
// alternate ingress. Never enable merely because a browser supplied XFF.
export function edgeClientIdentity(secret) {
  if (typeof secret !== 'string' || secret.length < 43) throw new Error('A strong edge credential is required');
  const expected = digest(secret);
  return req => {
    const proof = req.headers['x-meg-edge-key'];
    const address = req.headers['x-meg-client-ip'];
    if (typeof proof !== 'string' || proof.length > 256 || !timingSafeEqual(digest(proof), expected)
      || typeof address !== 'string' || !isIP(address)) throw new Error('Untrusted ingress');
    // Normalize equivalent IPv6 spellings before bucketing. Do not store raw IPs.
    const normalized = isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname : address;
    return digest(normalized).toString('hex');
  };
}
