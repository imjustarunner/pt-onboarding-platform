import { it, expect, vi } from 'vitest';
vi.mock('../officeScheduleMaterializer.service.js', () => ({
  isAssignmentActiveOnDate: (a, date) => a.date === date,
  shouldBookOnDate: (p, a, date) => p.dates.includes(date),
  shouldBookByCount: () => true
}));
import {
  validateOfficeSlotSeries,
  loadOfficeSlotInventory
} from '../officeSlotSeries.service.js';
const empty = () => ({ events: [], assignments: [], plans: [], legacy: [] });
const args = {
  providerId: 5,
  roomId: 2,
  officeLocationId: 1,
  startDate: '2026-10-30',
  startHour: 17,
  endHour: 19,
  recurrence: 'BIWEEKLY',
  occurrenceCount: 2,
  officeTimeZone: 'America/Denver',
  occurrenceDates: ['2026-10-30', '2026-11-13']
};
it('checks later dates across DST and returns the blocked hour without fetching each slot', async () => {
  const data = empty();
  data.events = [
    {
      room_id: 2,
      booked_provider_id: 7,
      start_at: '2026-11-14 01:00:00',
      end_at: '2026-11-14 02:00:00',
      first_name: 'Other'
    }
  ];
  const result = await validateOfficeSlotSeries({ ...args, inventory: data });
  expect(result).toMatchObject({
    ok: false,
    error: { blockedDate: '2026-11-13', blockedOccurrence: 2 }
  });
  expect(result.error.message).toContain('18:00');
});
it('respects a booked standing plan even when no day-grid event has been materialized', async () => {
  const data = empty();
  data.assignments = [
    {
      id: 9,
      room_id: 2,
      provider_id: 7,
      hour: 17,
      date: '2026-11-13',
      first_name: 'Other'
    }
  ];
  data.plans = [{ standing_assignment_id: 9, dates: ['2026-11-13'] }];
  expect(
    await validateOfficeSlotSeries({ ...args, inventory: data })
  ).toMatchObject({
    ok: false,
    error: { blockedDate: '2026-11-13', missingMaterializedEvent: true }
  });
  data.plans[0].dates = [];
  expect(await validateOfficeSlotSeries({ ...args, inventory: data })).toEqual({
    ok: true
  });
});
it('blocks a company hold without a named provider and an older room assignment', async () => {
  const data = empty();
  data.events = [
    {
      room_id: 2,
      start_at: '2026-10-30 23:00:00',
      end_at: '2026-10-31 00:00:00'
    }
  ];
  expect(
    (await validateOfficeSlotSeries({ ...args, inventory: data })).ok
  ).toBe(false);
  data.events = [];
  data.legacy = [
    {
      room_id: 2,
      assigned_user_id: 7,
      start_at: '2026-10-30 23:00:00',
      end_at: null
    }
  ];
  expect(
    (await validateOfficeSlotSeries({ ...args, inventory: data })).ok
  ).toBe(false);
});
it('loads the inventory with four bounded reads for all candidate rooms', async () => {
  const execute = vi.fn(async () => [[]]);
  await loadOfficeSlotInventory(
    { execute },
    {
      roomIds: [2, 3, 2],
      startAt: '2026-10-30 23:00:00',
      endAt: '2026-11-14 02:00:00'
    }
  );
  expect(execute).toHaveBeenCalledTimes(4);
  expect(execute.mock.calls[3][0]).toContain('a.assigned_user_id');
  expect(execute.mock.calls[0][1]).toEqual([
    2,
    3,
    '2026-11-14 02:00:00',
    '2026-10-30 23:00:00'
  ]);
});
