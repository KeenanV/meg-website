import {randomUUID} from 'node:crypto';
import {Timestamp} from '@google-cloud/firestore';

const LEASE = 30_000, RETENTION = 24 * 3_600_000;
function claimRecord(record, now) {
  if (record?.expires > now && record.status === 'complete') return 'complete';
  if (record?.leaseUntil > now) return 'busy';
  return {owner: randomUUID(), status: 'pending', leaseUntil: now + LEASE, expires: now + RETENTION};
}
export function memoryDeliveries(now = Date.now) {
  const records = new Map();
  return {
    async claim(key) {
      for (const [id, record] of records) if (record.expires <= now()) records.delete(id);
      const next = claimRecord(records.get(key), now());
      if (typeof next === 'string') return next;
      if (records.size >= 2048 && !records.has(key)) return 'busy';
      records.set(key, next); return next.owner;
    },
    async complete(key, owner) {const record = records.get(key); if (record?.owner === owner) record.status = 'complete';},
    async release(key, owner) {if (records.get(key)?.owner === owner) records.delete(key);},
  };
}
export function firestoreDeliveries(db, now = Date.now) {
  const collection = db.collection('publicationDeliveries');
  return {
    claim: key => db.runTransaction(async tx => {
      const ref = collection.doc(key), record = (await tx.get(ref)).data();
      const next = claimRecord(record, now());
      if (typeof next === 'string') return next;
      tx.set(ref, {...next, cleanupAt: Timestamp.fromMillis(next.expires)});
      return next.owner;
    }),
    complete: (key, owner) => db.runTransaction(async tx => {
      const ref = collection.doc(key), record = (await tx.get(ref)).data();
      if (record?.owner !== owner) throw new Error('Delivery lease lost');
      tx.update(ref, {status: 'complete', leaseUntil: 0});
    }),
    release: (key, owner) => db.runTransaction(async tx => {
      const ref = collection.doc(key), record = (await tx.get(ref)).data();
      if (record?.owner === owner && record.status !== 'complete') tx.delete(ref);
    }),
  };
}
