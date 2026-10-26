import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
import PayrollTimeClaim from '../../models/PayrollTimeClaim.model.js';
import PayrollMileageClaim from '../../models/PayrollMileageClaim.model.js';
let db;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER, first_name TEXT, last_name TEXT, email TEXT);
    CREATE TABLE payroll_periods (id INTEGER, agency_id INTEGER, period_start TEXT, period_end TEXT, status TEXT,
      posted_at TEXT, finalized_at TEXT, posted_by_user_id INTEGER, finalized_by_user_id INTEGER);
    INSERT INTO users VALUES (1, 'Payroll', 'Reviewer', 'reviewer@example.test');
    INSERT INTO payroll_periods (id, agency_id, period_start, period_end, status) VALUES
      (8, 2, '2026-10-10', '2026-10-23', 'ran'), (9, 3, '2026-10-10', '2026-10-23', 'staged');`);
  for (const table of ['payroll_time_claims', 'payroll_mileage_claims']) {
    db.exec(`CREATE TABLE ${table} (id INTEGER, agency_id INTEGER, user_id INTEGER, status TEXT, claim_type TEXT,
      claim_date TEXT, drive_date TEXT, payload_json TEXT, submitted_by_user_id INTEGER,
      approved_by_user_id INTEGER, target_payroll_period_id INTEGER, suggested_payroll_period_id INTEGER);
      INSERT INTO ${table} (id, agency_id, user_id, status, claim_type, claim_date, drive_date, approved_by_user_id, target_payroll_period_id)
      VALUES (1, 2, 7, 'approved', 'indirect_time', '2026-10-16', '2026-10-16', 1, 8),
        (2, 2, 7, 'submitted', 'indirect_time', '2026-10-17', '2026-10-17', NULL, NULL),
        (3, 3, 7, 'approved', 'indirect_time', '2026-10-16', '2026-10-16', 1, 9),
        (4, 2, 7, 'approved', 'indirect_time', '2026-10-16', '2026-10-16', 1, 9);`);
  }
  m.execute.mockImplementation(async (sql, params = []) => [db.prepare(sql).all(...params)]);
});
afterEach(() => db.close());
it.each([PayrollTimeClaim, PayrollMileageClaim])('uses the current posting state, scopes the period to its agency, and restores approved claims after unposting: %s', async model => {
  const list = () => model.listForAgency({ agencyId: 2, status: 'approved', unpostedOnly: true });
  expect(await list()).toMatchObject([{ id: 1, approved_by_first_name: 'Payroll', approved_period_start: '2026-10-10' }]);
  db.exec("UPDATE payroll_periods SET status='posted', posted_at='2026-10-24', posted_by_user_id=1 WHERE id=8");
  expect(await list()).toEqual([]);
  db.exec("UPDATE payroll_periods SET status='ran', posted_at=NULL, posted_by_user_id=NULL WHERE id=8");
  expect((await list()).map(c => c.id)).toEqual([1]);
  db.exec("UPDATE payroll_periods SET status='finalized' WHERE id=8");
  expect(await list()).toEqual([]);
});
it('filters posted history before pagination so it cannot crowd out open claims', async () => {
  db.exec("INSERT INTO payroll_periods (id,agency_id,status) VALUES (10,2,'posted'); INSERT INTO payroll_time_claims (id,agency_id,status,claim_date,target_payroll_period_id) VALUES (10,2,'approved','2026-10-26',10)");
  const rows = await PayrollTimeClaim.listForAgency({ agencyId: 2, status: 'approved', unpostedOnly: true, limit: 1 });
  expect(rows.map(c => c.id)).toEqual([1]);
});
it('leaves posted records available to historical payroll views', async () => {
  db.exec("UPDATE payroll_periods SET status='posted' WHERE id=8");
  const rows = await PayrollMileageClaim.listForAgency({ agencyId: 2, status: 'approved', targetPayrollPeriodId: 8 });
  expect(rows.map(c => c.id)).toEqual([1]);
});
