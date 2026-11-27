import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), sql: vi.fn(), allocate: vi.fn(), busy: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.sql } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ timezone: 'America/Denver' }) } }));
vi.mock('../auricwellAgendaImport.service.js', () => ({ authorizeAgendaProvider: mocks.authorize }));
vi.mock('../officeRoomAllocation.service.js', () => ({ allocateOfficeRoom: mocks.allocate }));
vi.mock('../providerCalendarBusy.service.js', () => ({ readProviderCalendarBusy: mocks.busy }));

import { providerPlannerDay, providerPlannerOfficeOptions } from '../providerDayPlanner.service.js';

const actor = { id: 7, role: 'provider' };
const input = { agencyId: '2', providerId: '7', date: '2026-11-30', startTime: '09:15', endTime: '12:48' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('provider planner day and office coverage', () => {
  it('reads private busy times across schedules without returning titles and uses only owned office reservations', async () => {
    mocks.busy.mockResolvedValue([{ start: new Date('2026-11-30T16:00:00Z'), end: new Date('2026-11-30T17:00:00Z'), title: 'Private' }]);
    mocks.sql.mockResolvedValueOnce([[{ start_at: '2026-11-30 18:00:00', end_at: '2026-11-30 18:30:00' }]]);
    mocks.sql.mockResolvedValueOnce([[{ office_location_id: 10, start_at: '2026-11-30 19:00:00', end_at: '2026-11-30 20:00:00', label: 'Room A' }]]);
    await expect(providerPlannerDay(actor, input)).resolves.toEqual({
      busy: [{ start: '09:00', end: '10:00' }, { start: '11:00', end: '11:30' }],
      reservations: [{ officeId: 10, start: '12:00', end: '13:00', room: 'Room A' }]
    });
    expect(mocks.authorize).toHaveBeenCalledWith({ actor, agencyId: 2, providerId: 7, planner: true });
    expect(mocks.sql.mock.calls[1][1]).toEqual([2, 7, '2026-12-01 07:00:00', '2026-11-30 07:00:00', 2]);
  });

  it('checks one uninterrupted whole-hour block per building using the same office rules as submission', async () => {
    mocks.sql.mockResolvedValue([[{ id: 10, name: 'Denver', timezone: 'America/Denver' }, { id: 11, name: 'Other office', timezone: 'America/Denver' }]]);
    mocks.allocate.mockResolvedValueOnce({ roomId: 101, roomLabel: 'Room A' });
    mocks.allocate.mockRejectedValueOnce(Object.assign(new Error('none'), { code: 'NO_SUITABLE_OFFICE' }));
    const result = await providerPlannerOfficeOptions(actor, input);
    expect(mocks.allocate).toHaveBeenCalledTimes(2);
    expect(mocks.allocate.mock.calls[0][1]).toEqual({ officeId: 10, providerId: 7, startDate: '2026-11-30',
      startHour: 9, endHour: 13, recurrence: 'ONCE', occurrenceCount: 1, source: 'intake' });
    expect(result).toEqual({ rooms: [{ officeId: 10, office: 'Denver', roomId: 101, room: 'Room A',
      date: '2026-11-30', weekday: 1, startHour: 9, endHour: 13, timeZone: 'America/Denver' }], awaiting: [] });
  });

  it('stops before reading a calendar or office inventory when provider access is denied', async () => {
    const denied = { status: 403 };
    mocks.authorize.mockRejectedValue(denied);
    await expect(providerPlannerDay(actor, { ...input, providerId: '8' })).rejects.toBe(denied);
    await expect(providerPlannerOfficeOptions(actor, { ...input, providerId: '8' })).rejects.toBe(denied);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.busy).not.toHaveBeenCalled();
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
});
