import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollImportRow from '../../models/PayrollImportRow.model.js';
import PayrollPeriodRunSnapshot from '../../models/PayrollPeriodRunSnapshot.model.js';
import SupervisorAssignment from '../../models/SupervisorAssignment.model.js';
import {
  buildComplianceDigest,
  buildComplianceEmailBody,
  listCurrentComplianceRows,
  periodMatchesComplianceUnlock
} from '../payrollCompliance.service.js';

test('compliance unlock accepts database Date objects', () => {
  assert.equal(periodMatchesComplianceUnlock({
    period_start: new Date('2026-08-15T00:00:00Z'),
    period_end: new Date('2026-08-28T00:00:00Z')
  }), true);
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
