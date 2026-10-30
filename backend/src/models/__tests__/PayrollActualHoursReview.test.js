import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
import PayrollActualHoursReview from '../PayrollActualHoursReview.model.js';
import { payrollHoursSourceFingerprint } from '../../utils/payrollActualHoursReview.js';
let conn, db, period, summary, previous, body;
beforeEach(() => {
  period = { id: 10, agency_id: 6, status: 'ran', period_start: '2026-11-07', period_end: '2026-11-20' };
  summary = { id: 20, agency_id: 6, user_id: 7, total_amount: 44, total_hours: 1, direct_hours: 1, breakdown: { '90837': { hours: 1, amount: 44 } } };
  previous = null;
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.includes('FROM payroll_periods')) return [[period].filter(Boolean)];
    if (sql.includes('FROM payroll_summaries')) return [[summary].filter(Boolean)];
    if (sql.includes('FROM user_agencies')) return [[{ user_id: 7 }]];
    if (sql.includes('FROM payroll_actual_hours_reviews')) return [[previous].filter(Boolean)];
    if (sql.includes('INSERT INTO payroll_actual_hours_reviews')) return [{ insertId: 5 }];
    return [{ affectedRows: 1 }];
  }) };
  db = { getConnection: vi.fn().mockResolvedValue(conn) };
  body = { actualWorkedHours: 1.5, statutorySickBasisHours: '', sourceReference: 'Reviewed time report 100', reconciliationNote: 'Reviewed daily entries and all waiting, indirect and support activity.', attested: true, expectedReviewId: null, expectedSummaryFingerprint: payrollHoursSourceFingerprint(summary) };
});
const save = () => PayrollActualHoursReview.save({ agencyId: 6, payrollPeriodId: 10, userId: 7, actorUserId: 9, body, db });
it('appends an attributed review and updates only the matching draft summary metadata', async () => {
  const result = await save();
  expect(result.sickLeaveSummary.actualWorkedHours).toBe(1.5);
  expect(result.sickLeaveSummary.sickLeaveHours).toBe(1.5);
  expect(result.review.reviewed_by_user_id).toBe(9);
  const update = conn.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE payroll_summaries'));
  expect(update[0]).not.toContain('total_amount');
  expect(update[1].slice(1)).toEqual([20, 6]);
  expect(JSON.parse(update[1][0]).__actualHoursReview.id).toBe(5);
  expect(conn.commit).toHaveBeenCalledOnce();
});
it.each([{ status: 'posted' }, { status: 'finalized' }, { status: 'ran', posted_by_user_id: 9 }, { status: 'ran', finalized_at: '2026-11-21' }])('rejects historical changes using status and lock metadata: %j', async lock => {
  Object.assign(period, lock);
  await expect(save()).rejects.toThrow('cannot be changed');
  expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT') || sql.startsWith('UPDATE'))).toBe(false);
  expect(conn.rollback).toHaveBeenCalledOnce();
});
it('rejects stale revisions and changed payroll instead of overwriting another review', async () => {
  previous = { id: 4 };
  await expect(save()).rejects.toThrow('Another reviewer');
  body.expectedReviewId = 4; body.expectedSummaryFingerprint = 'old';
  await expect(save()).rejects.toThrow('payroll calculation changed');
});
it('retains previous audit history by inserting a superseding review', async () => {
  previous = { id: 4 }; body.expectedReviewId = 4;
  const result = await save();
  expect(result.review.supersedes_review_id).toBe(4);
  expect(conn.execute.mock.calls.some(([sql]) => /UPDATE payroll_actual_hours_reviews|DELETE FROM payroll_actual_hours_reviews/.test(sql))).toBe(false);
});
it('rejects cross-organization periods and absent employee summaries', async () => {
  period = null; await expect(save()).rejects.toThrow('Pay period not found');
  period = { status: 'ran', period_start: '2026-11-07', period_end: '2026-11-20' }; summary = null;
  await expect(save()).rejects.toThrow('Run payroll');
});
