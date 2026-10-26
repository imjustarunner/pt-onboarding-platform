import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), attendees: vi.fn(), rate: vi.fn(), recompute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: { listAttendees: m.attendees } }));
vi.mock('../../models/PayrollRate.model.js', () => ({ default: { findBestRate: m.rate } }));
vi.mock('../supervision.service.js', () => ({ recomputeSupervisionAccountForUser: m.recompute }));
import { creditSuperviseeHoursFromFinalizedSession, createSuperviseeSupervisionTimeClaim } from '../supervisionFinalizePipeline.service.js';
beforeEach(() => {
  vi.clearAllMocks(); m.attendees.mockResolvedValue([]); m.rate.mockResolvedValue(null); m.recompute.mockResolvedValue({});
  m.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT supervision_start_date')) return [[{ supervision_start_date: '2026-01-01' }]];
    if (sql.includes('SELECT is_hourly_worker')) return [[{ is_hourly_worker: 0 }]];
    return [[]];
  });
});
it('credits each unpaid candidate session to individual hours without creating a payroll time claim', async () => {
  for (const id of [11, 12]) {
    const session = { id, agency_id: 2, supervisor_user_id: 6, supervisee_user_id: 7, session_type: 'individual', start_at: '2026-10-22 17:00:00' };
    const rollups = [{ user_id: 7, total_seconds: 3600 }];
    const result = await creditSuperviseeHoursFromFinalizedSession({ session, rollups });
    expect(result.credited).toMatchObject([{ userId: 7, individualHours: 1, groupHours: 0 }]);
    const claim = await createSuperviseeSupervisionTimeClaim({ session, rollups });
    expect(claim.skipped).toBe(true);
  }
  expect(m.recompute).toHaveBeenCalledTimes(2);
  expect(m.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO supervision_session_hour_credits'))).toHaveLength(2);
  expect(m.execute.mock.calls.some(([sql]) => /INSERT INTO payroll_time_claims/.test(sql))).toBe(false);
});
