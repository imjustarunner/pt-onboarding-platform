import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/PayrollPeriod.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/PayrollSummary.model.js', () => ({ default: { listForPeriod: vi.fn() } }));
vi.mock('../../models/PayrollActualHoursReview.model.js', () => ({ default: { latest: vi.fn(), save: vi.fn() } }));
vi.mock('../../services/payrollPto.service.js', async importOriginal => ({ ...await importOriginal(), getAgencyPtoPolicy: vi.fn() }));
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollSummary from '../../models/PayrollSummary.model.js';
import ActualReview from '../../models/PayrollActualHoursReview.model.js';
import { getAgencyPtoPolicy } from '../../services/payrollPto.service.js';
import { getPayrollActualHoursReview, savePayrollActualHoursReview, postPayrollPeriod } from '../payroll.controller.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = () => ({ params: { id: '10', userId: '7' }, user: { id: 9, role: 'super_admin' }, body: {} });
beforeEach(() => {
  vi.clearAllMocks();
  PayrollPeriod.findById.mockResolvedValue({ id: 10, agency_id: 6, status: 'ran', period_start: '2026-11-07', period_end: '2026-11-20' });
  PayrollSummary.listForPeriod.mockResolvedValue([{ user_id: 7, breakdown: { '90837': { hours: 1, amount: 44 } }, total_amount: 44 }]);
  getAgencyPtoPolicy.mockResolvedValue({ policy: { sickLeaveHoursEffectiveOn: '2026-11-07' } });
  ActualReview.latest.mockResolvedValue(null); ActualReview.save.mockResolvedValue({ review: { id: 1 } });
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT id, organization_type FROM agencies')) return [[{ id: 6, organization_type: 'agency' }]];
    if (sql.includes('COUNT(1) AS cnt FROM payroll_summaries')) return [[{ cnt: 1 }]];
    if (sql.includes('SELECT * FROM payroll_summaries')) return [[{ user_id: 7, total_amount: 44, breakdown: {} }]];
    return [[]];
  });
});
it('rejects an employee without payroll access before reading or saving review data', async () => {
  for (const handler of [getPayrollActualHoursReview, savePayrollActualHoursReview]) {
    const res = response(); await handler({ ...request(), user: { id: 7, role: 'provider' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  }
  expect(ActualReview.latest).not.toHaveBeenCalled(); expect(ActualReview.save).not.toHaveBeenCalled();
});
it('attributes an authorized save to the authenticated reviewer and period organization', async () => {
  const res = response(), next = vi.fn(); await savePayrollActualHoursReview(request(), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(ActualReview.save).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 6, payrollPeriodId: 10, userId: 7, actorUserId: 9 }));
});
it('blocks prospective uniform-accrual posting until actual hours match the run, before any posting side effects', async () => {
  const res = response(), next = vi.fn(); await postPayrollPeriod(request(), res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ actualHoursReviewUserIds: [7] }));
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes("SET status = 'posted'"))).toBe(false);
});
it('rejects stale review fingerprints at the posting gate', async () => {
  ActualReview.latest.mockResolvedValue({ id: 1, summary_fingerprint: 'older-run' });
  const res = response(); await postPayrollPeriod(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);
});
