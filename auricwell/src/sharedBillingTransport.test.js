import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedBillingTransport } from './sharedBillingTransport.js';

test('billing transport uses the product session, practice and exact reviewed body', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => { requests.push({ path, options }); return { ok: true, json: async () => ({ claim: { id: 42 } }) }; });
  const transport = sharedBillingTransport('/practices/synthetic');
  assert.deepEqual(await transport.get('/medical-billing/workspace', { params: { clientId: 31, search: undefined } }), { data: { claim: { id: 42 } } });
  assert.equal(requests[0].path, '/api/auricwell/practices/synthetic/shared-billing/workspace?clientId=31');
  const body = { approved: true, reviewHash: 'a'.repeat(64), accountMode: 'disabled' };
  await transport.post('/medical-billing/claimmd/claims/42/submit', body);
  assert.equal(requests[1].options.credentials, 'same-origin');
  assert.equal(requests[1].options.headers['X-AuricWell'], '1');
  assert.deepEqual(JSON.parse(requests[1].options.body), body);
  await assert.rejects(transport.get('https://other.example/claims'));
  assert.equal(requests.length, 2);
});

test('failed submission is returned to the billing UI without any retry', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status: 409, json: async () => ({ error: { message: 'Reconcile the existing claim.' } }) }; });
  await assert.rejects(sharedBillingTransport('/practices/synthetic').post('/medical-billing/claimmd/claims/42/submit', {}), error => error.response.status === 409 && error.response.data.error.message === 'Reconcile the existing claim.');
  assert.equal(calls, 1);
});
