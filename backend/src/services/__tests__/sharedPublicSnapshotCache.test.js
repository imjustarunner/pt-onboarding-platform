import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedPublicSnapshotCache } from '../sharedPublicSnapshotCache.js';

function fixture() {
  let time = 1000;
  const rows = new Map();
  const store = {
    async read(key) { const row = rows.get(key); return row?.expires > time ? structuredClone(row.value) : null; },
    async claim({ cacheKey, token }) {
      const row = rows.get(cacheKey);
      if (row?.token || row?.expires > time) return false;
      rows.set(cacheKey, { token }); return true;
    },
    async publish({ cacheKey, token, value, ttlSeconds }) {
      if (rows.get(cacheKey)?.token !== token) return false;
      rows.set(cacheKey, { value: structuredClone(value), expires: time + ttlSeconds * 1000 }); return true;
    },
    async release(key, token) { if (rows.get(key)?.token === token) rows.delete(key); }
  };
  return { rows, advance: ms => { time += ms; }, create: () => createSharedPublicSnapshotCache({ store, now: () => time, sleep: () => new Promise(resolve => setTimeout(resolve, 1)) }) };
}
const options = { key: ['week', 1, 9, '2030-01-07'], kind: 'availability', providerId: 9 };

test('many visitors on separate instances share one calculation and independent result objects', async () => {
  const f = fixture(), readers = [f.create(), f.create(), f.create()]; let calls = 0;
  const load = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return { slots: ['9am'] }; };
  const values = await Promise.all(Array.from({ length: 30 }, (_, i) => readers[i % 3](options, load)));
  assert.equal(calls, 1); values[0].slots.length = 0;
  assert.deepEqual(values[1], { slots: ['9am'] });
  assert.deepEqual(await readers[2](options, load), { slots: ['9am'] }); assert.equal(calls, 1);
});

test('expiry refreshes once; different agencies never reuse each other’s weeks', async () => {
  const f = fixture(), read = f.create(); let calls = 0;
  const load = async () => ({ revision: ++calls });
  await read(options, load); f.advance(61000);
  assert.deepEqual(await read(options, load), { revision: 2 });
  assert.deepEqual(await read({ ...options, key: ['week', 2, 9, '2030-01-07'] }, load), { revision: 3 });
});

test('an edit during a refresh discards obsolete results instead of republishing them', async () => {
  const f = fixture(), read = f.create(); let calls = 0;
  const result = await read(options, async () => {
    calls++;
    if (calls === 1) { f.rows.clear(); return { slots: ['now closed'] }; }
    return { slots: [] };
  });
  assert.equal(calls, 2); assert.deepEqual(result, { slots: [] });
  assert.deepEqual(await f.create()(options, () => assert.fail('must reuse refreshed snapshot')), result);
});

test('failed calculations are not cached as empty schedules and release the lease', async () => {
  const f = fixture(), read = f.create();
  await assert.rejects(read(options, async () => { throw new Error('calendar unavailable'); }), /calendar unavailable/);
  assert.deepEqual(await f.create()(options, async () => ({ slots: ['10am'] })), { slots: ['10am'] });
});

test('invalidation immediately removes even a fresh snapshot', async () => {
  const f = fixture(), read = f.create();
  await read(options, async () => ({ slots: ['9am'] })); f.rows.clear();
  assert.deepEqual(await read(options, async () => ({ slots: [] })), { slots: [] });
});

test('waiting on another instance is bounded instead of launching duplicate calculations', async () => {
  let time = 0, calls = 0;
  const read = createSharedPublicSnapshotCache({ store: { read: async () => null, claim: async () => false },
    now: () => time, sleep: async ms => { time += ms; }, waitMs: 500 });
  await assert.rejects(read(options, async () => { calls++; }), error => error.status === 503);
  assert.equal(calls, 0);
});
