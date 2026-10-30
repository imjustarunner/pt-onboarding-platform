import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), compute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../schoolClientLeaveBasis.service.js', () => ({ computeSchoolClientLeaveBasis: m.compute }));
import { buildSchoolSupportAccrualReview } from '../schoolSupportAccrualReview.service.js';
let period, latestImport, roster, summaries, postings, importRows, ledger;
const employee = (values = {}) => ({ user_id: 10, first_name: 'School', last_name: 'Provider', role: 'provider', employment_type: 'hourly', school_support_balance_hours: 18, school_assigned: 1, ...values });
const summary = (values = {}) => ({ user_id: 10, direct_hours: 25, indirect_hours: 0, total_hours: 25, breakdown: {}, computed_at: '2026-10-30 12:00:00', ...values });
const args = { agencyId: 2, payrollPeriodId: 148 };
beforeEach(() => {
  vi.clearAllMocks();
  period = { id: 148, agency_id: 2, status: 'draft', period_start: '2026-10-24', period_end: '2026-11-06', pto_policy_json: { schoolSupportEnabled: true, sharedLeaveAccrualEnabled: true, schoolSupportAccrualAfter: '2026-10-09', schoolSupportSchoolClientOnlyProposedOn: '2026-10-24', schoolSupportSchoolClientOnlyReviewPeriodId: 148, schoolSupportSchoolClientOnlyReviewStatus: 'awaiting_billing_import' } };
  latestImport = { id: 200, slot_number: 1, created_at: '2026-10-30 10:00:00' };
  roster = [employee()]; summaries = [summary()]; postings = []; ledger = [];
  importRows = [{ user_id: 10, report_rows: 2, payable_rows: 2, undated_rows: 0, undated_payable_rows: 0, first_service_date: '2026-10-24', last_service_date: '2026-10-30' }];
  m.compute.mockResolvedValue({ complete: true, basisHours: 12.5, coverage: { importId: 200, reportRows: 2, payableRows: 2, schoolRows: 1, excludedRows: 1, nonpayableRows: 0, reviewRows: 0 }, reviewReasons: [] });
  m.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM payroll_periods p JOIN agencies')) return [[period].filter(Boolean)];
    if (sql.includes('SELECT id,slot_number,created_at FROM payroll_imports')) return [[latestImport].filter(Boolean)];
    if (sql.includes('FROM users u JOIN user_agencies')) return [roster];
    if (sql.includes('FROM payroll_summaries')) return [summaries];
    if (sql.includes('FROM payroll_leave_basis_postings')) return [postings];
    if (sql.includes('FROM payroll_import_rows')) return [importRows];
    if (sql.includes('FROM payroll_pto_ledger')) return [ledger];
    throw Error('Unexpected SQL');
  });
});
it('shows the missing current-period import as unknown, with all balances protected and no projections', async () => {
  latestImport = null; summaries = [];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.status).toBe('awaiting_billing_import'); expect(result.importCoverage).toMatchObject({ present: false, reportRows: null, payableRows: null });
  expect(result.employees[0]).toMatchObject({ currentSchoolSupportHours: 18, protectedEarnedBalanceHours: 18, allWork: { basisHours: null, estimatedEarnedHours: null }, schoolOnly: { basisHours: null, estimatedEarnedHours: null }, difference: { basisHours: null, earnedHours: null } });
  expect(result.totals.earnedDifferenceHours).toBeNull(); expect(result.totals.currentSchoolSupportHours).toBe(18);
  expect(result.policy).toMatchObject({ configuredSchoolClientOnlyEffectiveOn: null, proposedSchoolClientOnlyEffectiveOn: '2026-10-24', reviewPeriodId: 148 });
  expect(m.compute).not.toHaveBeenCalled(); expect(m.execute.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
});
it('compares the all-work and verified school-only rules at the same current cap capacity', async () => {
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.complete).toBe(true); expect(result.importCoverage).toMatchObject({ firstServiceDate: '2026-10-24', lastServiceDate: '2026-10-30' });
  expect(result.employees[0]).toMatchObject({ comparisonStartingBalanceHours: 18, allWork: { basisHours: 25, estimatedEarnedHours: 2 }, schoolOnly: { basisHours: 12.5, estimatedEarnedHours: 1 }, difference: { basisHours: -12.5, earnedHours: -1 } });
  expect(result.protection).toMatchObject({ readOnly: true, existingEarnedBalancesPreserved: true, balanceChangesApplied: false, requiresReviewBeforeActivation: true });
  expect(result.totals).toMatchObject({ currentSchoolSupportHours: 18, allWorkEarnedHours: 2, schoolOnlyEarnedHours: 1, earnedDifferenceHours: -1 });
});
it('uses the ledger opening balance for a booked period instead of treating an already-full bank as zero capacity', async () => {
  roster = [employee({ school_support_balance_hours: 20 })];
  postings = [{ user_id: 10, payroll_period_id: 148, basis_hours: 25, earned_hours: 2, created_at: '2026-10-30 13:00:00' }];
  ledger = [{ id: 1, user_id: 10, entry_type: 'starting_balance', hours_delta: 18, payroll_period_id: null, created_at: '2026-10-01 10:00:00' }, { id: 2, user_id: 10, entry_type: 'accrual', hours_delta: 2, payroll_period_id: 148, created_at: '2026-10-30 13:00:00' }];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees[0]).toMatchObject({ protectedEarnedBalanceHours: 20, bookedAccrual: { basisHours: 25, earnedHours: 2 }, comparisonStartingBalanceHours: 18, comparisonStartingBalanceSource: 'ledger_before_booked_accrual', difference: { earnedHours: -1 } });
  expect(result.protection.bookedAccrualsPreserved).toBe(true);
});
it('preserves balances above the cap and estimates no additional earnings without reducing them', async () => {
  roster = [employee({ school_support_balance_hours: 22 })];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees[0]).toMatchObject({ currentSchoolSupportHours: 22, allWork: { estimatedEarnedHours: 0 }, schoolOnly: { estimatedEarnedHours: 0 }, difference: { earnedHours: 0 } });
});
it.each(['missing', 'stale'])('does not compare against a %s payroll summary', async mode => {
  summaries = mode === 'missing' ? [] : [summary({ computed_at: '2026-10-29 10:00:00' })];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees[0]).toMatchObject({ status: 'awaiting_payroll_summary', difference: { basisHours: null, earnedHours: null } });
  expect(m.compute).not.toHaveBeenCalled();
});
it('does not turn incomplete or sensitive row evidence into zero accrual or expose it in the DTO', async () => {
  m.compute.mockResolvedValue({ complete: false, basisHours: 3, clientName: 'PRIVATE CLIENT', memberId: 'PRIVATE MEMBER', coverage: { importId: 200, reviewRows: 1 }, reviewReasons: [{ payrollImportRowId: 44, code: 'school_client_evidence_incomplete', clientName: 'PRIVATE CLIENT' }, { code: 'PRIVATE MEMBER' }] });
  const result = await buildSchoolSupportAccrualReview(args), text = JSON.stringify(result);
  expect(result.employees[0]).toMatchObject({ status: 'awaiting_school_evidence', schoolOnly: { basisHours: null, estimatedEarnedHours: null }, difference: { earnedHours: null } });
  expect(text).not.toContain('PRIVATE'); expect(text).not.toContain('payrollImportRowId'); expect(text).not.toContain('memberId');
});
it('includes named owner and super-admin employees, with no earning bank for an employee without a school assignment', async () => {
  roster = [employee(), employee({ user_id: 501, first_name: 'Named', last_name: 'Owner', role: 'super_admin', school_assigned: 0, school_support_balance_hours: 1 })];
  summaries = [summary(), summary({ user_id: 501, direct_hours: 5, total_hours: 5 })];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees).toHaveLength(2); expect(result.employees[1]).toMatchObject({ userId: 501, status: 'not_school_assigned', allWork: { basisHours: 0, estimatedEarnedHours: 0 }, schoolOnly: { basisHours: 0, estimatedEarnedHours: 0 } });
  const rosterSql = m.execute.mock.calls.find(([sql]) => sql.includes('FROM users u JOIN user_agencies'))[0];
  expect(rosterSql).toContain('u.id<>1'); expect(rosterSql).toContain("u.status='ACTIVE_EMPLOYEE'"); expect(rosterSql).not.toContain("'super_admin'");
});
it('keeps comparisons unknown when an earned account or booked ledger is inconsistent', async () => {
  roster = [employee({ school_support_balance_hours: null })];
  let result = await buildSchoolSupportAccrualReview(args); expect(result.employees[0].status).toBe('awaiting_account_review'); expect(result.totals.currentSchoolSupportHours).toBeNull();
  roster = [employee({ school_support_balance_hours: 20 })]; postings = [{ user_id: 10, payroll_period_id: 148, basis_hours: 25, earned_hours: 2, created_at: '2026-10-30 13:00:00' }]; ledger = [];
  result = await buildSchoolSupportAccrualReview(args); expect(result.employees[0]).toMatchObject({ status: 'awaiting_account_review', difference: { earnedHours: null }, protectedEarnedBalanceHours: 20 });
});
it('rejects dates missing from payable rows and reports global unmatched-provider coverage', async () => {
  importRows[0].undated_payable_rows = 1; importRows.push({ user_id: null, report_rows: 1, payable_rows: 1 });
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.status).toBe('awaiting_provider_matching'); expect(result.totals.earnedDifferenceHours).toBeNull(); expect(result.employees[0].reviewReasons).toContainEqual({ code: 'payable_service_date_missing' }); expect(m.compute).not.toHaveBeenCalled();
});
it('rejects another agency’s period before reading employee data', async () => {
  period = null; await expect(buildSchoolSupportAccrualReview(args)).rejects.toMatchObject({ status: 404 });
  expect(m.execute).toHaveBeenCalledTimes(1); expect(m.execute.mock.calls[0][1]).toEqual([148, 2]);
});

it('does not let office-only employees without summaries hold up a completed school-bank review', async () => {
  roster = [employee(), employee({ user_id: 501, first_name: 'Named', last_name: 'Owner', role: 'super_admin', school_assigned: 0, school_support_balance_hours: 1.25 })];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.complete).toBe(true); expect(result.totals).toMatchObject({ activeEmployees: 2, comparedEmployees: 2, currentSchoolSupportHours: 19.25, earnedDifferenceHours: -1 });
  expect(result.employees[1]).toMatchObject({ status: 'not_school_assigned', complete: true, summaryAvailable: false, protectedEarnedBalanceHours: 1.25, allWork: { basisHours: 0, estimatedEarnedHours: 0 }, schoolOnly: { basisHours: 0, estimatedEarnedHours: 0 }, difference: { basisHours: 0, earnedHours: 0 } });
  expect(m.compute).toHaveBeenCalledTimes(1);
});
it('keeps even office-only comparisons unknown while the current period has no import', async () => {
  latestImport = null; summaries = []; roster = [employee({ school_assigned: 0, school_support_balance_hours: 2 })];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees[0]).toMatchObject({ status: 'awaiting_billing_import', complete: false, protectedEarnedBalanceHours: 2, difference: { basisHours: null, earnedHours: null } });
  expect(result.totals.earnedDifferenceHours).toBeNull();
});
it.each(['ran','posted','finalized'])('can establish no new school earning when a %s period has no payable imported activity or summary for the employee', async status => {
  period.status = status; summaries = []; importRows = [{ user_id: 10, report_rows: 2, payable_rows: 0, undated_payable_rows: 0 }];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees[0]).toMatchObject({ status: 'not_in_payroll', complete: true, protectedEarnedBalanceHours: 18, allWork: { basisHours: 0, estimatedEarnedHours: 0 }, schoolOnly: { basisHours: 0, estimatedEarnedHours: 0 }, difference: { basisHours: 0, earnedHours: 0 } });
  expect(m.compute).not.toHaveBeenCalled();
});
it('does not infer no school earning from a missing draft summary and absent employee rows', async () => {
  summaries = []; importRows = [];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees[0]).toMatchObject({ status: 'awaiting_payroll_summary', complete: false, allWork: { estimatedEarnedHours: null }, schoolOnly: { estimatedEarnedHours: null }, difference: { earnedHours: null } });
});
it('requires summary review for payable rows or existing booked accruals even after a payroll run', async () => {
  period.status = 'ran'; summaries = [];
  let result = await buildSchoolSupportAccrualReview(args); expect(result.employees[0].status).toBe('awaiting_payroll_summary');
  importRows = []; postings = [{ user_id: 10, payroll_period_id: 148, basis_hours: 25, earned_hours: 2, created_at: '2026-10-30 13:00:00' }];
  result = await buildSchoolSupportAccrualReview(args);
  expect(result.employees[0]).toMatchObject({ status: 'awaiting_payroll_summary', bookedAccrual: { earnedHours: 2 }, difference: { earnedHours: null } });
});
it('does not call missing-person activity zero while a payable provider identity remains unassigned', async () => {
  period.status = 'posted'; summaries = []; importRows = [{ user_id: null, report_rows: 1, payable_rows: 1 }];
  const result = await buildSchoolSupportAccrualReview(args);
  expect(result.status).toBe('awaiting_provider_matching'); expect(result.employees[0]).toMatchObject({ status: 'awaiting_payroll_summary', difference: { earnedHours: null } });
});
