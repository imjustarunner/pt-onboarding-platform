import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { withReviewedEventTravelClaim } from '../../utils/eventTravelApproval';
function database(reviewedAt) {
  const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.includes('SELECT user_id')) return [[{ user_id: 7 }]];
    if (sql.includes('SELECT id FROM users')) return [[{ id: 7 }]];
    return [[{ reviewed_at: reviewedAt, report_json: { reviewedAt } }]];
  }) };
  return { db, dbPool: { getConnection: async () => db } };
}
it('serializes approval with report edits and passes the locked transaction to the payroll writer', async () => {
  const { db, dbPool } = database('2026-10-27T18:00:00Z'), write = vi.fn(async () => ({ id: 99 }));
  expect(await withReviewedEventTravelClaim({ table: 'payroll_time_claims', id: 99, reviewedAt: '2026-10-27T18:00:00Z', dbPool }, write)).toEqual({ id: 99 });
  expect(db.execute.mock.calls[1][0]).toContain('users WHERE id = ? FOR UPDATE');
  expect(db.execute.mock.calls[2][0]).toContain('FOR UPDATE');
  expect(write).toHaveBeenCalledWith(db); expect(db.commit).toHaveBeenCalledOnce(); expect(db.release).toHaveBeenCalledOnce();
});
it('cannot approve amounts calculated from a report changed while the approval waited', async () => {
  const { db, dbPool } = database('2026-10-27T19:00:00Z'), write = vi.fn();
  await expect(withReviewedEventTravelClaim({ table: 'payroll_mileage_claims', id: 99, reviewedAt: '2026-10-27T18:00:00Z', dbPool }, write)).rejects.toMatchObject({ status: 409 });
  expect(write).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalledOnce(); expect(db.commit).not.toHaveBeenCalled();
});
it('rolls back a failed payroll write instead of leaving an approval half applied', async () => {
  const { db, dbPool } = database('2026-10-27T18:00:00Z');
  await expect(withReviewedEventTravelClaim({ table: 'payroll_time_claims', id: 99, reviewedAt: '2026-10-27T18:00:00Z', dbPool }, async () => { throw new Error('write failed'); })).rejects.toThrow('write failed');
  expect(db.rollback).toHaveBeenCalledOnce(); expect(db.commit).not.toHaveBeenCalled(); expect(db.release).toHaveBeenCalledOnce();
});
