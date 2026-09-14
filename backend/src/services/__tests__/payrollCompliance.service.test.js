import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollImportRow from '../../models/PayrollImportRow.model.js';
import SupervisorAssignment from '../../models/SupervisorAssignment.model.js';
import {
  buildComplianceDigest,
  buildComplianceEmailBody,
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
