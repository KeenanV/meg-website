import {createHash} from 'node:crypto';
import {Timestamp} from '@google-cloud/firestore';

const hash = value => createHash('sha256').update(value).digest('hex');
const hour = 3_600_000;

// All windows are reserved atomically before an expensive/external operation.
// A rejected request does not increment counters or extend a cooldown.
export function firestoreAllowance(db, namespace, now = Date.now) {
  const collection = db.collection('abuseLimits');
  const denied = new Map();
  return async rules => {
    const time = now();
    for (const [key, expiry] of denied) if (expiry <= time) denied.delete(key);
    for (const rule of rules) if (denied.has(rule.key)) return false;
    const refs = rules.map(rule => collection.doc(hash(namespace + ':' + rule.key)));
    const result = await db.runTransaction(async tx => {
      const snapshots = await tx.getAll(...refs);
      const counters = snapshots.map((snapshot, i) => {
        const previous = snapshot.data();
        return previous?.expires.toMillis() > time ? previous : {count: 0, expires: Timestamp.fromMillis(time + rules[i].duration)};
      });
      const blocked = counters.findIndex((counter, i) => counter.count >= rules[i].limit);
      if (blocked !== -1) return {blocked, expires: counters[blocked].expires.toMillis()};
      counters.forEach((counter, i) => tx.set(refs[i], {...counter, count: counter.count + 1}));
      return {blocked: -1};
    });
    if (result.blocked !== -1) {
      if (denied.size < 2048) denied.set(rules[result.blocked].key, result.expires);
      return false;
    }
    return true;
  };
}

// Development/test implementation only. Cloud deployments must use Firestore.
export function memoryAllowance(now = Date.now) {
  const counters = new Map();
  return async rules => {
    const time = now();
    for (const [key, value] of counters) if (value.expires <= time) counters.delete(key);
    if (counters.size + rules.filter(rule => !counters.has(rule.key)).length > 2048) return false;
    const values = rules.map(rule => counters.get(rule.key) || {count: 0, expires: time + rule.duration});
    if (values.some((value, i) => value.count >= rules[i].limit)) return false;
    values.forEach((value, i) => counters.set(rules[i].key, {...value, count: value.count + 1}));
    return true;
  };
}

export function contactProtection(allow) {
  return {
    assessment: () => allow([{key: 'contact-assessment-hour', limit: 30, duration: hour}]),
    // Reserved after reCAPTCHA succeeds, before Resend. Delivery failures still
    // consume a slot: retries must never turn an upstream outage into a flood.
    delivery: email => allow([
      {key: 'contact-send-burst', limit: 5, duration: 600_000},
      {key: 'contact-send-hour', limit: 10, duration: hour},
      {key: 'contact-send-day', limit: 30, duration: 24 * hour},
      {key: 'contact-email:' + hash(email.toLowerCase()), limit: 3, duration: 600_000},
    ]),
  };
}

// Synchronous, bounded work before reading bodies or contacting Firestore.
export function localBurst(limit, duration, now = Date.now) {
  let count = 0, expires = 0;
  return () => {
    if (expires <= now()) { count = 0; expires = now() + duration; }
    return ++count <= limit;
  };
}
