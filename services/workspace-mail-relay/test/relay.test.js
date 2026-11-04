import { test } from 'node:test';
import assert from 'node:assert/strict';
import addressparser from 'nodemailer/lib/addressparser/index.js';
import { prepareMessage, dispatchMessage } from '../relay.js';

const raw = (extra = '', bccLast = false) => Buffer.from(`From: Demo Billing <billing@practice.example>\r\nTo: "Demo, Payer" <payer@example.com>\r\nMessage-ID: <comm-42@practice.example>\r\n${extra}${bccLast ? 'Bcc: hidden@example.com' : 'Bcc: hidden@example.com\r\nMIME-Version: 1.0'}\r\n\r\nDemo receipt only.\r\n`).toString('base64url');
const input = () => ({ key: 'communication:42', from: 'billing@practice.example', raw: raw() });
const config = { domains: ['practice.example'], parseAddresses: addressparser };
const message = () => prepareMessage(input(), config);
function memoryStore() {
  const values = new Map(); let generation = 0;
  return { values, async read(key) { return values.get(key) || null; }, async write(key, value, expected) {
    if ((values.get(key)?.generation || 0) !== expected) throw Object.assign(new Error('Precondition'), { code: 412 });
    const saved = { value, generation: ++generation }; values.set(key, saved); return saved;
  } };
}
const transport = () => ({ calls: [], async sendMail(value) { this.calls.push(value); return { accepted: ['payer@example.com', 'hidden@example.com'], rejected: [] }; } });
test('derives the private envelope and removes Bcc including a final header', () => {
  for (const bccLast of [false, true]) {
    const m = prepareMessage({ ...input(), raw: raw('', bccLast) }, config);
    assert.deepEqual(m.recipients, ['hidden@example.com', 'payer@example.com']);
    assert.ok(!/^Bcc:/im.test(m.raw)); assert.ok(!m.raw.includes('hidden@example.com')); assert.ok(m.raw.includes('Demo receipt only.'));
  }
});
test('rejects foreign/AI senders, mismatched From, repeated headers and unsupported recipients', () => {
  for (const change of [{ from: 'billing@foreign.example' }, { from: 'ai@practice.example' }, { raw: raw('From: other@practice.example\r\n') }, { raw: raw('Sender: ai@practice.example\r\n') }, { key: '../42' }]) assert.throws(() => prepareMessage({ ...input(), ...change }, config));
  assert.throws(() => prepareMessage({ ...input(), raw: Buffer.from(Buffer.from(raw(), 'base64url').toString().replace('payer@example.com', 'not-an-address')).toString('base64url') }, config));
});
test('blocks a truncated header section and an oversized message before delivery', () => {
  assert.throws(() => prepareMessage({ ...input(), raw: Buffer.from('From: a@example.com\n\nBody').toString('base64url') }, config));
  assert.throws(() => prepareMessage(input(), { ...config, maxBytes: 10 }));
});
test('a duplicate accepted delivery returns the original receipt without a second SMTP send', async () => {
  const store = memoryStore(), smtp = transport(), m = message();
  const first = await dispatchMessage(m, { store, smtp });
  const second = await dispatchMessage(m, { store, smtp });
  assert.equal(first.status, 'accepted'); assert.equal(second.duplicate, true); assert.equal(smtp.calls.length, 1);
  assert.equal(smtp.calls[0].envelope.from, 'billing@practice.example');
  const persisted = JSON.stringify([...store.values.values()]);
  assert.ok(!persisted.includes('payer@example.com')); assert.ok(!persisted.includes('Demo receipt'));
});
test('does not reuse a communication key for a different recipient set', async () => {
  const store = memoryStore(), smtp = transport(), m = message(); await dispatchMessage(m, { store, smtp });
  await assert.rejects(() => dispatchMessage({ ...m, scope: 'changed' }, { store, smtp }), { code: 'delivery_scope_changed' });
  assert.equal(smtp.calls.length, 1);
});
test('uncertain DATA failure stays held instead of retrying SMTP', async () => {
  const store = memoryStore(), smtp = transport(), m = message();
  smtp.sendMail = async function (x) { this.calls.push(x); throw Object.assign(new Error('Disconnected'), { command: 'DATA', code: 'ECONNECTION' }); };
  await assert.rejects(() => dispatchMessage(m, { store, smtp }), { code: 'delivery_requires_review' });
  await assert.rejects(() => dispatchMessage(m, { store, smtp }), { code: 'delivery_requires_review' });
  assert.equal(smtp.calls.length, 1);
});
test('an explicit SMTP rejection permits retry of the same saved communication', async () => {
  const store = memoryStore(), smtp = transport(), m = message();
  const send = smtp.sendMail.bind(smtp); let rejected = false;
  smtp.sendMail = async x => { if (!rejected) { rejected = true; throw Object.assign(new Error('Try later'), { command: 'DATA', responseCode: 451 }); } return send(x); };
  await assert.rejects(() => dispatchMessage(m, { store, smtp }), { code: 'smtp_rejected' });
  assert.equal((await dispatchMessage(m, { store, smtp })).status, 'accepted');
});
test('a racing request cannot pass the durable pre-send lock', async () => {
  const store = memoryStore(), smtp = transport(), m = message();
  const results = await Promise.allSettled([dispatchMessage(m, { store, smtp }), dispatchMessage(m, { store, smtp })]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(smtp.calls.length, 1);
});
test('SMTP acceptance is preserved if the final state write fails', async () => {
  const store = memoryStore(), smtp = transport(), m = message(); const write = store.write.bind(store);
  store.write = async (key, value, generation) => { if (value.status === 'accepted') throw new Error('Storage interrupted'); return write(key, value, generation); };
  assert.equal((await dispatchMessage(m, { store, smtp })).status, 'accepted');
  await assert.rejects(() => dispatchMessage(m, { store, smtp }), { code: 'delivery_requires_review' }); assert.equal(smtp.calls.length, 1);
});
test('partial SMTP acceptance is retained for review and never resent as a whole', async () => {
  const store = memoryStore(), smtp = transport(), m = message(); smtp.sendMail = async x => { smtp.calls.push(x); return { accepted: ['payer@example.com'], rejected: ['hidden@example.com'] }; };
  const first = await dispatchMessage(m, { store, smtp }); assert.equal(first.partial, true); assert.equal(first.rejectedCount, 1);
  await dispatchMessage(m, { store, smtp }); assert.equal(smtp.calls.length, 1);
});
