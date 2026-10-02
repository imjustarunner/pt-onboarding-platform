import { it, expect, vi } from 'vitest';
import { readProviderCalendarBusy } from '../providerCalendarBusy.service.js';
const window = { providerId: 9, startAt: '2030-11-03 00:00:00', endAt: '2030-11-05 00:00:00', timeZone: 'America/Denver' };
it('preserves a full local all-day block across the fall DST transition', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 1, all_day: 1, start_date: '2030-11-03', end_date: '2030-11-04', event_timezone: 'America/Denver' }]]) };
  const [busy] = await readProviderCalendarBusy(db, window);
  expect(busy.start.toISOString()).toBe('2030-11-03T06:00:00.000Z');
  expect(busy.end.toISOString()).toBe('2030-11-04T07:00:00.000Z');
  expect(+busy.end - +busy.start).toBe(25 * 3600000);
});
it('keeps timed holds in UTC and does not leak private contents', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 1, all_day: 0, start_at: '2030-11-03 18:00:00', end_at: '2030-11-03 19:00:00', title: 'private' }]]) };
  expect(await readProviderCalendarBusy(db, window)).toEqual([{ start: new Date('2030-11-03T18:00:00Z'), end: new Date('2030-11-03T19:00:00Z') }]);
  expect(db.execute.mock.calls[0][0]).toContain('a.event_id = p.id');
  expect(db.execute.mock.calls[0][0]).not.toContain('agency_id =');
});
it('an all-day event ending at the window boundary does not block the next day', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 1, all_day: 1, start_date: '2030-11-02', end_date: '2030-11-03', event_timezone: 'UTC' }]]) };
  expect(await readProviderCalendarBusy(db, window)).toEqual([]);
});
