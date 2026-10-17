import {createHash, timingSafeEqual} from 'node:crypto';

// Reviewers use generated high-entropy passwords. Fast digest comparisons keep
// this per-asset gate inexpensive and do not invoke scrypt for anonymous traffic.
export function reviewerAccess({basicHash, reviewers}) {
  const values = reviewers === undefined ? [basicHash] : Object.values(reviewers || {});
  if (!values.length || values.length > 20 || values.some(value => !/^[a-f0-9]{64}$/.test(value || ''))) return null;
  const hashes = values.map(value => Buffer.from(value, 'hex'));
  return (authorization = '') => {
    const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
    if (!basic || authorization.length > 1024) return false;
    const supplied = createHash('sha256').update(Buffer.from(basic[1], 'base64')).digest();
    let valid = 0;
    for (const hash of hashes) valid |= Number(timingSafeEqual(supplied, hash));
    return Boolean(valid);
  };
}
