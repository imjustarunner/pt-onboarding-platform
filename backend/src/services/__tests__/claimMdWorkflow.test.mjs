import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.SKIP_DB_CONNECT = '1';
process.env.NODE_ENV = 'test';
const { default: clinicalPool } = await import('../../config/clinicalDatabase.js');
const { default: pool } = await import('../../config/database.js');
const { sharedClaimMdConnection, requireClaimMdTransmission } = await import('../claimMdConnection.service.js');
const { claimReviewHash, safeEnrollmentUrl, responseLifecycle, claimResponseSuggestions, syncClaimMdResponses, verifyClaimMdWebhook } = await import('../claimMdWorkflow.service.js');
const { uploadClaims, requestEligibilityJson, fetchPayers } = await import('../claimMd.service.js');
const { decryptFamilyBilling } = await import('../familyBillingEncryption.service.js');
beforeEach(() => { process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 8).toString('base64'); process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID = 'v1'; });
after(async () => { await clinicalPool.end(); await pool.end(); });

test('management key is scoped to an explicit agency allowlist and defaults to disabled', () => {
  const env = { CLAIM_MD_ACCOUNT_KEY: 'test-only', CLAIM_MD_AGENCY_IDS: '1, 2', CLAIM_MD_ACCOUNT_ID: '100' };
  assert.equal(sharedClaimMdConnection(3, env), null);
  assert.equal(sharedClaimMdConnection(1, env).mode, 'disabled');
  assert.throws(() => requireClaimMdTransmission(sharedClaimMdConnection(1, env)), /disabled/);
  assert.throws(() => sharedClaimMdConnection(1, { ...env, CLAIM_MD_ACCOUNT_ID: '' }), /ACCOUNT_ID/);
  assert.doesNotThrow(() => requireClaimMdTransmission({ mode: 'test' }));
  assert.equal(sharedClaimMdConnection(2, env).connectionId, 'account:100');
});
test('approval digest changes with patient, charge, modifier, or identifier changes', () => {
  const payload = { pat_name_f: 'Test', bill_npi: '1234567893', charge: [{ charge: '12.34', mod1: 'GT' }] };
  for (const update of [{ pat_name_f: 'Changed' }, { bill_npi: '9876543210' }, { charge: [{ charge: '13.00' }] }]) assert.notEqual(claimReviewHash(payload), claimReviewHash({ ...payload, ...update }));
});
test('enrollment redirects accept only Claim.MD HTTPS enrollment links', () => {
  assert.equal(safeEnrollmentUrl({ link: { url: 'https://www.claim.md/enroll/abc/' } }), 'https://www.claim.md/enroll/abc/');
  for (const url of ['javascript:alert(1)', 'https://www.claim.md.evil.test/enroll/x', 'https://user@www.claim.md/enroll/x', 'http://www.claim.md/enroll/x']) assert.throws(() => safeEnrollmentUrl({ link: { url } }));
});
test('acknowledgements and free text cannot mark a claim paid', () => {
  assert.equal(responseLifecycle({ status: 'A', messages: { message: 'Paid, finalized' } }), 'submitted');
  assert.equal(responseLifecycle({ status: 'unknown' }), null);
  assert.equal(responseLifecycle({ status: 'A', messages: [{ status: 'R' }] }), 'rejected');
  assert.match(claimResponseSuggestions({ status: 'R', messages: { fields: 'diag_1 mod1' } })[0], /clinician/);
});
test('webhook signatures require exact bytes and reject unsigned or changed deliveries', () => {
  const key = 'test-\u00e9-key', raw = Buffer.from('{ "events": [] }');
  const signature = crypto.createHmac('sha256', Buffer.from(key, 'latin1')).update(raw).digest('base64');
  assert.equal(verifyClaimMdWebhook(raw, signature, key), true);
  assert.equal(verifyClaimMdWebhook(Buffer.from('{"events":[]}'), signature, key), false);
  assert.equal(verifyClaimMdWebhook(raw, undefined, key), false);
  assert.equal(verifyClaimMdWebhook(raw, signature, 'other'), false);
});
function database({ failEvent = false } = {}) {
  const calls = [], events = new Set(); let cursor = '0', rolledBack = false, committed = 0, updates = 0;
  const conn = { beginTransaction: async () => {}, commit: async () => { committed++; }, rollback: async () => { rolledBack = true; }, release() {},
    async execute(sql, args) {
      calls.push({ sql, args });
      if (sql.startsWith('SELECT last_response_id')) return [[{ last_response_id: cursor }]];
      if (sql.startsWith('SELECT id, claimmd_claim_id')) {
        assert.equal(args[1], 1); assert.equal(args[2], 'account:100');
        return [args[0] === '11' ? [{ id: 11, claimmd_claim_id: '800', claimmd_last_response_id: '0', claim_lifecycle: 'queued' }] : []];
      }
      if (sql.startsWith('INSERT IGNORE INTO claimmd_claim_events')) {
        if (failEvent) throw new Error('persistence unavailable');
        if (events.has(args[3])) return [{ affectedRows: 0 }];
        events.add(args[3]); return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE clinical_claims')) updates++;
      if (sql.startsWith('UPDATE claimmd_sync_state')) cursor = args[0];
      return [{ affectedRows: 1 }];
    }
  };
  return { getConnection: async () => conn, calls, get cursor() { return cursor; }, get committed() { return committed; }, get rolledBack() { return rolledBack; }, get updates() { return updates; } };
}
const connection = { accountKey: 'private-key', connectionId: 'account:100' };
const feed = { last_responseid: '9007199254740994', claim: [
  { remote_claimid: 'PT-1-11', claimmd_id: '800', status: 'R', messages: { responseid: '9007199254740993', fields: 'ins_number', message: 'Invalid member' } },
  { remote_claimid: 'PT-2-22', claimmd_id: '801', status: 'A', messages: { responseid: '9007199254740994', message: 'OTHER AGENCY PRIVATE DATA' } }
] };
test('shared-account synchronization persists only this agency, deduplicates, and preserves large cursor IDs', async () => {
  const db = database();
  const result = await syncClaimMdResponses({ agencyId: 1, connection, db, download: async () => feed });
  assert.equal(result.updated, 1); assert.equal(db.cursor, feed.last_responseid);
  const event = db.calls.find(c => c.sql.startsWith('INSERT IGNORE INTO claimmd_claim_events'));
  assert.equal(event.args[6].includes('Invalid member'), false);
  assert.equal(decryptFamilyBilling(event.args[6], 'claimmd:1:11:response:9007199254740993').messages[0].message, 'Invalid member');
  assert.equal(JSON.stringify(db.calls).includes('OTHER AGENCY PRIVATE DATA'), false);
  const repeat = await syncClaimMdResponses({ agencyId: 1, connection, db, download: async () => feed });
  assert.equal(repeat.updated, 0); assert.equal(db.updates, 1);
});
test('failed event persistence does not advance the response cursor', async () => {
  const db = database({ failEvent: true });
  await assert.rejects(syncClaimMdResponses({ agencyId: 1, connection, db, download: async () => feed }), /persistence/);
  assert.equal(db.rolledBack, true); assert.equal(db.cursor, '0'); assert.equal(db.committed, 0);
});
test('invalid response cursors roll back instead of silently skipping data', async () => {
  const db = database();
  await assert.rejects(syncClaimMdResponses({ agencyId: 1, connection, db, download: async () => ({ last_responseid: 'bad' }) }), /cursor/);
  assert.equal(db.committed, 0);
});
test('adapter keeps AccountKey server-owned and rejects HTTP-200 error bodies', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => { request = options; return { ok: true, text: async () => JSON.stringify({ payer: [] }) }; });
  await requestEligibilityJson({ accountKey: 'ours', payload: { AccountKey: 'attacker' } });
  assert.equal(request.body.get('AccountKey'), 'ours');
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => JSON.stringify({ error: { message: 'Secret detail' } }) }));
  await assert.rejects(fetchPayers({ accountKey: 'ours', payerName: 'Test' }), e => !e.message.includes('Secret detail'));
});
test('an ambiguous upload failure makes exactly one network attempt', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('timeout'); });
  await assert.rejects(uploadClaims({ accountKey: 'ours', fileContents: '{"claim":[]}' }));
  assert.equal(calls, 1);
});

test('enrollment webhook handler acknowledges only after commit and ignores replayed events', async t => {
  const { default: router } = await import('../../routes/claimMdWebhook.routes.js');
  const handler = router.stack.find(layer => layer.route)?.route.stack.at(-1).handle;
  const saved = new Set(), calls = [];
  let commits = 0;
  t.mock.method(clinicalPool, 'getConnection', async () => ({
    beginTransaction: async () => {}, rollback: async () => {}, release() {}, commit: async () => { commits++; },
    execute: async (sql, args) => {
      calls.push({ sql, args });
      if (sql.startsWith('INSERT IGNORE')) {
        if (saved.has(args[1])) return [{ affectedRows: 0 }];
        saved.add(args[1]);
      }
      return [{ affectedRows: 1 }];
    }
  }));
  const envNames = ['CLAIM_MD_AGENCY_IDS','CLAIM_MD_ACCOUNT_ID','CLAIM_MD_ACCOUNT_KEY'];
  const before = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, { CLAIM_MD_AGENCY_IDS: '1,2', CLAIM_MD_ACCOUNT_ID: '100', CLAIM_MD_ACCOUNT_KEY: 'synthetic-only' });
  try {
    const raw = Buffer.from(JSON.stringify({ acct_number: '100', events: [{ eventid: 'evt1', event_type: 'enroll', event_time: '2026-09-24T10:00:00Z', event_data: { enroll: { event: 'enrolled', payerid: 'TEST', enroll_type: '1500', prov_npi: '1234567893', prov_taxid: '123456789' } } }] }));
    const signature = crypto.createHmac('sha256', 'synthetic-only').update(raw).digest('base64');
    const send = async sig => {
      const response = { status: null, sendStatus(value) { if (value === 200) assert.ok(commits > 0); this.status = value; } };
      await handler({ body: raw, get: () => sig }, response, e => { throw e; }); return response.status;
    };
    assert.equal(await send('invalid'), 401); assert.equal(calls.length, 0);
    assert.equal(await send(signature), 200); assert.equal(await send(signature), 200);
    assert.equal(calls.filter(c => c.sql.startsWith('UPDATE claimmd_enrollments')).length, 1);
    const update = calls.find(c => c.sql.startsWith('UPDATE claimmd_enrollments'));
    assert.match(update.sql, /last_event_at <=/); assert.deepEqual(update.args.slice(3,5), [1,2]);
  } finally { for (const name of envNames) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; } }
});
