import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), agencies: vi.fn(), user: vi.fn(), list: vi.fn(), rate: vi.fn(), card: vi.fn(), finalize: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.agencies, findById: m.user } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: { listAttendanceLogsForAgency: m.list } }));
vi.mock('../../models/PayrollRate.model.js', () => ({ default: { findBestRate: m.rate } }));
vi.mock('../../models/PayrollRateCard.model.js', () => ({ default: { findForUser: m.card } }));
vi.mock('../../services/supervisionFinalizePipeline.service.js', () => ({ autoFinalizeOverdueSessions: m.finalize }));
import { listSupervisionAttendanceLogs } from '../supervisionSessions.controller.js';
beforeEach(() => {
  vi.clearAllMocks(); m.agencies.mockResolvedValue([{ id: 2 }]); m.user.mockResolvedValue({ is_hourly_worker: 0 });
  m.execute.mockResolvedValue([[]]); m.card.mockResolvedValue({ indirect_rate: 20 }); m.finalize.mockResolvedValue({});
  m.rate.mockImplementation(async ({ serviceCode }) => ({ rate_amount: serviceCode === '99416' ? 100 : 65, rate_unit: 'per_hour' }));
});
async function logs(row) {
  m.list.mockResolvedValue([{ session_id: 381, user_id: 7, agency_id: 2, participant_role: 'supervisor', session_type: 'group', total_seconds: 3600, start_at: '2026-10-22', ...row }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await listSupervisionAttendanceLogs({ user: { id: 1, role: 'admin' }, query: { agencyId: '2' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0];
}
it('uses only the group supervision rate, without adding individual supervision', async () => {
  const result = await logs({});
  const row = (result.logs || result.rows || result)[0];
  expect(row.pay).toMatchObject({ serviceCodes: ['99416'], rateAmount: 100, computedAmount: 100 });
  expect(m.rate).toHaveBeenCalledTimes(1);
});
it('keeps the individual supervision rate for individual sessions', async () => {
  const result = await logs({ session_type: 'individual' });
  expect((result.logs || result.rows || result)[0].pay).toMatchObject({ serviceCodes: ['99415'], rateAmount: 65 });
});
it('keeps unpaid candidate attendance visible without marking it payable', async () => {
  const result = await logs({ participant_role: 'supervisee', session_type: 'individual' });
  expect((result.logs || result.rows || result)[0]).toMatchObject({ totalHours: 1, pay: { payable: false, computedAmount: 0 } });
});

it('shows paid hourly supervisees at their existing indirect rate with no candidate hours', async () => {
  m.user.mockResolvedValue({ is_hourly_worker: 1, credential: 'BA', role: 'provider' });
  m.execute.mockResolvedValue([[{ supervision_is_prelicensed: 0 }]]); m.rate.mockResolvedValue(null); m.card.mockResolvedValue({ indirect_rate: 21 });
  const result = await logs({ participant_role: 'supervisee', session_type: 'individual', total_seconds: 3720 });
  expect(result.logs[0].pay).toMatchObject({ payable: true, rateAmount: 21, computedAmount: 21.63 });
});
