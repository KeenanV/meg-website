import test from 'node:test';
import assert from 'node:assert/strict';
import {contactProtection, firestoreAllowance, memoryAllowance} from '../src/abuse.mjs';

// Serializes transactions like Firestore; fresh adapters share persisted state.
export function fakeDatabase() {
  const documents = new Map();
  let queue = Promise.resolve(), transactions = 0;
  return {
    documents, get transactions() { return transactions; },
    collection: name => ({doc: id => ({key: `${name}/${id}`})}),
    runTransaction(callback) {
      const operation = queue.then(async () => {
        transactions++;
        const writes = [];
        const result = await callback({
          getAll: async (...refs) => refs.map(ref => ({data: () => documents.get(ref.key)})),
          set: (ref, data) => writes.push([ref.key, data]),
        });
        writes.forEach(([key, data]) => documents.set(key, data));
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

test('random addresses across instances cannot exceed shared delivery allowance', async () => {
  const db = fakeDatabase();
  const instances = Array.from({length: 4}, () => contactProtection(firestoreAllowance(db, 'contact')));
  const results = await Promise.all(Array.from({length: 50}, (_, i) => instances[i % 4].delivery(`random${i}@example.com`)));
  assert.equal(results.filter(Boolean).length, 5);
  const restarted = contactProtection(firestoreAllowance(db, 'contact'));
  assert.equal(await restarted.delivery('fresh@example.com'), false);
  assert.equal([...db.documents.keys()].some(key => key.includes('@')), false);
});

test('daily allowance survives rolling bursts and hourly resets', async () => {
  let time = 1000;
  const guard = contactProtection(memoryAllowance(() => time));
  for (let hour = 0; hour < 3; hour++) {
    for (let burst = 0; burst < 2; burst++) {
      for (let i = 0; i < 5; i++) assert.equal(await guard.delivery(`${hour}-${burst}-${i}@example.com`), true);
      time += 600_001;
    }
    assert.equal(await guard.delivery('blocked@example.com'), false);
    time += 3_600_001;
  }
  assert.equal(await guard.delivery('new-address@example.com'), false);
  time += 86_400_001;
  assert.equal(await guard.delivery('new-address@example.com'), true);
});

test('denied allowance is cached without extending expiry or consuming other counters', async () => {
  let time = 1000;
  const db = fakeDatabase();
  const allow = firestoreAllowance(db, 'test', () => time);
  const rules = [{key: 'global', limit: 1, duration: 1000}];
  assert.equal(await allow(rules), true);
  assert.equal(await allow([...rules, {key: 'other', limit: 1, duration: 1000}]), false);
  assert.equal(db.documents.size, 1);
  const count = db.transactions;
  for (let i = 0; i < 100; i++) assert.equal(await allow(rules), false);
  assert.equal(db.transactions, count);
  time += 1001;
  assert.equal(await allow(rules), true);
});
