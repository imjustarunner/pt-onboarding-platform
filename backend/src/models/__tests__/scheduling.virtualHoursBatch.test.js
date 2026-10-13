import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import VirtualHours from '../ProviderVirtualWorkingHours.model.js';
beforeEach(() => { vi.clearAllMocks(); });
it('reads hundreds of permitted agencies in one provider-scoped query without losing recurrence', async () => {
  db.execute.mockResolvedValue([[{ id: 9, agency_id: 22, day_of_week: 'Tuesday', start_time: '09:00:00', end_time: '11:00:00', session_type: 'BOTH', frequency: 'BIWEEKLY', start_date: '2026-10-13', excluded_dates_json: '["2026-10-27"]' }]]);
  const ids = Array.from({ length: 300 }, (_, i) => i + 1);
  const rows = await VirtualHours.listForProvider({ agencyIds: ids, providerId: 7 });
  expect(db.execute).toHaveBeenCalledTimes(1);
  expect(db.execute.mock.calls[0][0]).toContain('AND provider_id = ?');
  expect(db.execute.mock.calls[0][1]).toEqual([...ids, 7]);
  expect(rows[0]).toMatchObject({ agencyId: 22, frequency: 'BIWEEKLY', startDate: '2026-10-13', excludedDates: ['2026-10-27'], availableForIntake: true });
});
it('does not query for an empty scope or invalid provider', async () => {
  expect(await VirtualHours.listForProvider({ agencyIds: [], providerId: 7 })).toEqual([]);
  expect(await VirtualHours.listForProvider({ agencyIds: [2], providerId: 0 })).toEqual([]);
  expect(db.execute).not.toHaveBeenCalled();
});
it('preserves single-agency callers and tenant restrictions on a legacy schema', async () => {
  db.execute.mockRejectedValueOnce({ code: 'ER_BAD_FIELD_ERROR' }).mockResolvedValueOnce([[{ id: 1, agency_id: 2, day_of_week: 'Monday', start_time: '08:00:00', end_time: '09:00:00' }]]);
  const rows = await VirtualHours.listForProvider({ agencyId: 2, providerId: 7 });
  expect(rows[0]).toMatchObject({ agencyId: 2, dayOfWeek: 'Monday', startTime: '08:00', frequency: 'WEEKLY' });
  for (const [sql, params] of db.execute.mock.calls) {
    expect(sql).toContain('WHERE agency_id IN (?) AND provider_id = ?');
    expect(params).toEqual([2, 7]);
  }
});
