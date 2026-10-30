import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), compute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => m, execute: m.execute } }));
vi.mock('../schoolClientLeaveBasis.service.js', () => ({ computeSchoolClientLeaveBasis: m.compute }));
import { postSupplementalLeave } from '../supplementalLeave.service.js';
let posted;
const policy = { sharedLeaveAccrualEnabled: true, trainingPtoEnabled: true, schoolSupportEnabled: true, schoolSupportAccrualAfter: '2026-10-09', schoolSupportSchoolClientOnlyEffectiveOn: '2026-11-07', trainingMaxBalance: 20 };
const base = { agencyId: 2, userId: 10, payrollPeriodId: 149, period: { status: 'posted', period_start: '2026-11-07', period_end: '2026-11-20' }, summaryRow: { direct_hours: 25 }, employmentType: 'hourly', actorId: 501, policy };
beforeEach(() => {
  vi.clearAllMocks(); posted = new Set();
  m.compute.mockResolvedValue({ complete: true, basisHours: 6, coverage: { importId: 100, schoolRows: 4, reviewRows: 0 }, reviewReasons: [] });
  m.execute.mockImplementation(async (sql, params) => {
    if (sql.startsWith('SELECT * FROM payroll_pto_accounts')) return [[{ school_support_balance_hours: 3, training_balance_hours: 2, training_adp_through_date: '2026-10-09', training_adp_confirmed_at: new Date() }]];
    if (sql.startsWith('SELECT psa.id')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT 1 FROM payroll_leave_basis_postings')) return [posted.has(params[3]) ? [{ exists: 1 }] : []];
    return [{ affectedRows: 1 }];
  });
});
const postings = () => m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO payroll_leave_basis_postings')).map(([, p]) => p);
it('uses the school-only basis from its dated start while training retains the full basis', async () => {
  await postSupplementalLeave(base);
  expect(postings()).toEqual([[2, 10, 149, 'training', 25, .208333], [2, 10, 149, 'school_support', 6, .48]]);
  expect(m.compute).toHaveBeenCalledWith({ agencyId: 2, userId: 10, payrollPeriodId: 149, periodStart: '2026-11-07', periodEnd: '2026-11-20', db: m });
  expect(m.execute.mock.calls.find(([sql, params]) => sql.startsWith('INSERT INTO payroll_pto_ledger') && params[2] === 'school_support')[1][6]).toContain('Verified school-client service basis: 6.000000');
});
it('keeps historical periods and unconfigured policies on the existing earned-hours basis', async () => {
  await postSupplementalLeave({ ...base, period: { status: 'posted', period_start: '2026-10-24', period_end: '2026-11-06' } });
  expect(postings().find(p => p[3] === 'school_support')).toEqual([2, 10, 149, 'school_support', 25, 2]);
  expect(m.compute).not.toHaveBeenCalled();
  m.execute.mockClear();
  await postSupplementalLeave({ ...base, policy: { ...policy, schoolSupportSchoolClientOnlyEffectiveOn: null } });
  expect(postings().find(p => p[3] === 'school_support')[4]).toBe(25);
});
it('continues training but does not post or deduct a school bank when school evidence is incomplete', async () => {
  m.compute.mockResolvedValue({ complete: false, basisHours: 6, coverage: { importId: 100, reviewRows: 2 }, reviewReasons: [{ code: 'school_client_evidence_incomplete' }] });
  const warnings = await postSupplementalLeave(base);
  expect(postings()).toEqual([[2, 10, 149, 'training', 25, .208333]]);
  expect(warnings).toContainEqual(expect.objectContaining({ userId: 10, bucket: 'school_support', code: 'school_client_basis_incomplete', coverage: { importId: 100, reviewRows: 2 } }));
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE payroll_pto_accounts SET school_support_balance_hours'))).toBe(false);
  expect(m.commit).toHaveBeenCalledOnce();
});
it('preserves an already booked school posting without recomputing or lowering the earned balance', async () => {
  posted.add('school_support'); await postSupplementalLeave(base);
  expect(m.compute).not.toHaveBeenCalled(); expect(postings().some(p => p[3] === 'school_support')).toBe(false);
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE payroll_pto_accounts SET school_support_balance_hours'))).toBe(false);
});
it('does not silently use the broader basis for an invalid effective date', async () => {
  const warnings = await postSupplementalLeave({ ...base, policy: { ...policy, schoolSupportSchoolClientOnlyEffectiveOn: '2026-02-30' } });
  expect(warnings[0]).toMatchObject({ bucket: 'school_support', code: 'school_client_basis_effective_date_invalid' });
  expect(postings().map(p => p[3])).toEqual(['training']); expect(m.compute).not.toHaveBeenCalled();
});

const pendingReviewPolicy={...policy,schoolSupportSchoolClientOnlyEffectiveOn:null,schoolSupportSchoolClientOnlyProposedOn:'2026-10-24',schoolSupportSchoolClientOnlyReviewPeriodId:148,schoolSupportSchoolClientOnlyReviewStatus:'awaiting_billing_import'};
it.each(['awaiting_billing_import','awaiting_review'])('continues training while the current-period school basis is %s', async reviewStatus => {
  const warnings=await postSupplementalLeave({...base,payrollPeriodId:148,period:{status:'posted',period_start:'2026-10-24',period_end:'2026-11-06'},policy:{...pendingReviewPolicy,schoolSupportSchoolClientOnlyReviewStatus:reviewStatus}});
  expect(postings()).toEqual([[2,10,148,'training',25,.208333]]);
  expect(warnings).toContainEqual(expect.objectContaining({bucket:'school_support',code:'school_client_basis_review_pending',reviewStatus,reviewPayrollPeriodId:148}));
  expect(m.compute).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE payroll_pto_accounts SET school_support_balance_hours'))).toBe(false);
});
it('leaves older periods and approved-review periods unblocked', async () => {
  const olderWarnings=await postSupplementalLeave({...base,payrollPeriodId:147,period:{status:'posted',period_start:'2026-10-10',period_end:'2026-10-23'},policy:pendingReviewPolicy});
  expect(olderWarnings).toEqual([]);expect(postings().find(p=>p[3]==='school_support')).toEqual([2,10,147,'school_support',25,2]);
  m.execute.mockClear();
  const approvedWarnings=await postSupplementalLeave({...base,policy:{...pendingReviewPolicy,schoolSupportSchoolClientOnlyReviewStatus:'approved',schoolSupportSchoolClientOnlyEffectiveOn:'2026-11-07'}});
  expect(approvedWarnings).toEqual([]);expect(postings().find(p=>p[3]==='school_support')).toEqual([2,10,149,'school_support',6,.48]);
});
it('preserves a booked school posting before checking a pending owner review', async () => {
  posted.add('school_support');
  const warnings=await postSupplementalLeave({...base,policy:pendingReviewPolicy});
  expect(warnings).toEqual([]);expect(postings().map(p=>p[3])).toEqual(['training']);expect(m.compute).not.toHaveBeenCalled();
});
it('warns instead of activating or falling back when the proposed review date is invalid', async () => {
  const warnings=await postSupplementalLeave({...base,policy:{...pendingReviewPolicy,schoolSupportSchoolClientOnlyProposedOn:'2026-02-30'}});
  expect(warnings).toContainEqual(expect.objectContaining({bucket:'school_support',code:'school_client_basis_proposed_date_invalid'}));
  expect(postings().map(p=>p[3])).toEqual(['training']);expect(m.compute).not.toHaveBeenCalled();
});
