import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import PayrollImport from '../../models/PayrollImport.model.js';
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollImportRow from '../../models/PayrollImportRow.model.js';
import PayrollPeriodRunSnapshot from '../../models/PayrollPeriodRunSnapshot.model.js';
import SupervisorAssignment from '../../models/SupervisorAssignment.model.js';
import { encryptBillingSecret } from '../billingEncryption.service.js';
import {
  buildComplianceDigest,
  buildComplianceEmailBody,
  listCurrentComplianceRows,
  previewComplianceEmail,
  periodMatchesComplianceUnlock
} from '../payrollCompliance.service.js';

test('preview tolerates an unauthenticatable snapshot identity without losing outstanding notes', async (t) => {
  const previousKey = process.env.BILLING_ENCRYPTION_KEY_BASE64;
  process.env.BILLING_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 17).toString('base64');
  t.after(() => {
    if (previousKey === undefined) delete process.env.BILLING_ENCRYPTION_KEY_BASE64;
    else process.env.BILLING_ENCRYPTION_KEY_BASE64 = previousKey;
  });
  const encrypted = encryptBillingSecret(JSON.stringify({ patientFirstName: 'Example', providerName: 'Test Provider' }));
  const base = {
    user_id: 5, service_date: '2026-07-29', service_code: '90837', no_note_units: 1, draft_units: 0,
    payload_ciphertext_b64: encrypted.ciphertextB64,
    payload_iv_b64: encrypted.ivB64,
    payload_auth_tag_b64: encrypted.authTagB64
  };
  const period = { id: 42, agency_id: 7, period_start: '2026-07-18', period_end: '2026-07-31' };
  t.mock.method(PayrollPeriod, 'findById', async () => period);
  t.mock.method(SupervisorAssignment, 'getSupervisorIds', async () => []);
  t.mock.method(PayrollImportRow, 'listForPeriod', async () => assert.fail('Must not revive stale import'));
  t.mock.method(PayrollPeriodRunSnapshot, 'listForRun', async () => [
    { ...base, id: 601, payload_auth_tag_b64: Buffer.alloc(16).toString('base64') },
    { ...base, id: 602 }
  ]);
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('payroll_compliance_unlocked_at')) return [[{ payroll_compliance_unlocked_at: '2026-08-15' }]];
    if (sql.includes('FROM payroll_periods pp')) return [[period]];
    if (sql.includes('FROM payroll_period_runs r')) return [[{ id: 91 }]];
    if (sql.includes('agency_compliance_notification_mutes') || sql.includes('billing_encounters')) return [[]];
    if (sql.includes('FROM users')) return [[{ id: 5, first_name: 'Test', last_name: 'Provider', email: 'test@example.com' }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const preview = await previewComplianceEmail({ agencyId: 7, payrollPeriodId: 42, userId: 5 });
  assert.equal(preview.hasContent, true);
  assert.match(preview.text, /7\/29 - Client name unavailable \(90837\)/);
  assert.match(preview.text, /7\/29 - Example \(90837\)/);
  const excluded = await previewComplianceEmail({ agencyId: 7, payrollPeriodId: 42, userId: 5, excludedRowIds: [-601] });
  assert.doesNotMatch(excluded.text, /Client name unavailable/);
  assert.match(excluded.text, /Example/);
});

test('compliance unlock accepts database Date objects', () => {
  assert.equal(periodMatchesComplianceUnlock({
    period_start: new Date('2026-08-15T00:00:00Z'),
    period_end: new Date('2026-08-28T00:00:00Z')
  }), true);
});

test('recovers unreadable names only from exact snapshot matches without changing note status', async (t) => {
  const key = createHash('sha256').update('7|2026-02-05|H2014|test provider|example').digest('hex');
  t.mock.method(pool, 'execute', async () => [[{ id: 91 }]]);
  t.mock.method(PayrollImport, 'listForPeriod', async () => [{ id: 12 }]);
  const imports = t.mock.method(PayrollImportRow, 'listForImportId', async () => [
    { agency_id: 7, user_id: 5, provider_name: 'Test Provider', patient_first_name: 'Wrong Client', service_date: '2026-02-05', service_code: 'H2014' },
    { agency_id: 7, user_id: 5, provider_name: 'Test Provider', patient_first_name: 'Example', service_date: new Date('2026-02-05T00:00:00Z'), service_code: 'H2014', note_status: 'FINALIZED' }
  ]);
  t.mock.method(PayrollPeriodRunSnapshot, 'listForRun', async () => [
    { id: 601, agency_id: 7, user_id: 5, row_match_key: key, service_date: '2026-02-05', service_code: 'H2014', no_note_units: 1, payload_ciphertext_b64: 'unreadable' },
    { id: 602, agency_id: 7, user_id: 5, row_match_key: 'no-match', service_date: '2026-02-05', service_code: 'H2014', no_note_units: 1, payload_ciphertext_b64: 'unreadable' },
    { id: 603, agency_id: 8, user_id: 5, row_match_key: key, no_note_units: 1 }
  ]);
  const rows = await listCurrentComplianceRows(42);
  assert.equal(rows[0].patient_first_name, 'Example');
  assert.equal(rows[0].note_status, 'NO_NOTE');
  assert.equal(rows[0].id, -601);
  assert.equal(rows[1].patient_first_name, 'Client name unavailable');
  assert.equal(rows[2].patient_first_name, 'Client name unavailable');
  assert.equal(imports.mock.callCount(), 1);
});

test('digest includes current and older missing notes with normalized dates and manual exclusions', async (t) => {
  const periods = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    agency_id: 7,
    period_start: new Date(Date.UTC(2026, 8, 12 - index * 14)),
    period_end: new Date(Date.UTC(2026, 8, 25 - index * 14))
  }));
  t.mock.method(PayrollPeriod, 'findById', async () => periods[0]);
  t.mock.method(SupervisorAssignment, 'getSupervisorIds', async () => []);
  const queriedPeriods = [];
  t.mock.method(PayrollImportRow, 'listForPeriod', async (id) => {
    queriedPeriods.push(id);
    return [
      { id: id * 10, user_id: 5, note_status: 'NO_NOTE', service_date: periods[id - 1].period_start, service_code: '90837' },
      { id: id * 10 + 1, user_id: 5, note_status: 'FINALIZED' },
      { id: id * 10 + 2, user_id: 5, note_status: 'DRAFT', draft_payable: 1 }
    ];
  });
  t.mock.method(pool, 'execute', async (sql, params) => {
    if (sql.includes('payroll_compliance_unlocked_at')) return [[{ payroll_compliance_unlocked_at: '2026-08-15' }]];
    if (sql.includes('FROM payroll_period_runs r')) return [[]];
    if (sql.includes('FROM payroll_periods pp')) {
      assert.deepEqual(params, [7, '2026-09-12']);
      assert.match(sql, /pp\.agency_id = \? AND pp\.period_start <= \?/);
      assert.doesNotMatch(sql, /LIMIT/);
      return [periods];
    }
    if (sql.includes('agency_compliance_notification_mutes') || sql.includes('billing_encounters')) return [[]];
    if (sql.includes('FROM users')) return [[{ id: 5, first_name: 'Test', last_name: 'Provider', email: 'test@example.com' }]];
    throw new Error(`Unexpected query: ${sql}`);
  });

  const digest = await buildComplianceDigest({ agencyId: 7, payrollPeriodId: 1 });
  assert.equal(digest.period.label, '2026-09-12 → 2026-09-25');
  assert.equal(queriedPeriods.length, 10);
  assert.equal(digest.providers.length, 1);
  const provider = digest.providers[0];
  assert.equal(provider.lateNotesByPeriod.length, 10);
  assert.ok(provider.lateNotesByPeriod.every((group) => group.rows.length === 1));
  assert.equal(provider.lateNotesByPeriod[0].rows[0].label, '9/12 - 90837');

  const selected = buildComplianceEmailBody({ provider, excludedRowIds: [10] });
  assert.equal(selected.hasContent, true);
  assert.ok(!selected.text.includes('9/12 - 90837'));
  const empty = buildComplianceEmailBody({ provider, excludedRowIds: queriedPeriods.map((id) => id * 10) });
  assert.equal(empty.hasContent, false);
});

test('newer catch-up snapshot replaces stale imports, removing completed and deleted notes but keeping old missing notes', async (t) => {
  t.mock.method(pool, 'execute', async (sql, params) => {
    assert.deepEqual(params, [42]);
    assert.match(sql, /r\.payroll_import_id IS NULL/);
    assert.match(sql, /pi\.created_at >= r\.ran_at/);
    assert.match(sql, /ORDER BY r\.ran_at DESC, r\.id DESC LIMIT 1/);
    return [[{ id: 91 }]];
  });
  t.mock.method(PayrollImportRow, 'listForPeriod', async () => {
    assert.fail('Stale import must not be merged into the latest full report');
  });
  t.mock.method(PayrollPeriodRunSnapshot, 'listForRun', async (id) => {
    assert.equal(id, 91);
    return [
      { id: 501, user_id: 5, service_date: '2026-07-29', service_code: '90837', no_note_units: 1, draft_units: 0 },
      { id: 502, user_id: 5, service_date: '2026-07-06', service_code: 'H0004', no_note_units: 0, draft_units: 0, finalized_units: 1 },
      { id: 503, user_id: 5, service_date: '2026-07-07', service_code: 'H0004', no_note_units: 0, draft_units: 1 }
      // A deleted session is absent from the replacement snapshot.
    ];
  });
  const rows = await listCurrentComplianceRows(42);
  assert.deepEqual(rows.map((r) => [r.id, r.note_status]), [[-501, 'NO_NOTE'], [-503, 'DRAFT']]);
  assert.equal(rows[0].service_date, '2026-07-29');
  const body = buildComplianceEmailBody({
    provider: { name: 'Test', lateNotesByPeriod: [{ periodLabel: 'July', rows: rows.map((r) => ({ ...r, label: r.service_date })) }] },
    excludedRowIds: [-501, -503]
  });
  assert.equal(body.hasContent, false);
});

test('newer catch-up report with all notes completed stays empty instead of reviving baseline notes', async (t) => {
  t.mock.method(pool, 'execute', async () => [[{ id: 92 }]]);
  t.mock.method(PayrollPeriodRunSnapshot, 'listForRun', async () => [
    { id: 504, no_note_units: 0, draft_units: 0, finalized_units: 1 }
  ]);
  t.mock.method(PayrollImportRow, 'listForPeriod', async () => assert.fail('No fallback to stale rows'));
  assert.deepEqual(await listCurrentComplianceRows(42), []);
});

test('uses current import when no newer snapshot-only report exists', async (t) => {
  t.mock.method(pool, 'execute', async () => [[]]);
  const currentRows = [{ id: 12, note_status: 'NO_NOTE' }];
  t.mock.method(PayrollImportRow, 'listForPeriod', async (id) => {
    assert.equal(id, 42);
    return currentRows;
  });
  assert.equal(await listCurrentComplianceRows(42), currentRows);
});
