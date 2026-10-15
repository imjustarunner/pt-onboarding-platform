import { describe, expect, it } from 'vitest';
import { allDayItemOccursOn, visibleScheduleHours } from '../scheduleVisibleHours';

describe('visible schedule hours', () => {
  const dates = ['2026-10-15'];
  it('expands for early and late items without hiding the normal day', () => {
    const hours = visibleScheduleHours({ dates, items: [
      { startAt: '2026-10-15T05:15:00', endAt: '2026-10-15T06:00:00' },
      { startAt: '2026-10-15T22:45:00', endAt: '2026-10-15T23:15:00' }
    ] });
    expect(hours[0]).toBe(5); expect(hours.at(-1)).toBe(23);
  });
  it('uses exclusive end boundaries, ignores other dates and all-day events', () => {
    const hours = visibleScheduleHours({ dates, items: [
      { startAt: '2026-10-15T21:00:00', endAt: '2026-10-15T22:00:00' },
      { allDay: true, startAt: '2026-10-15T00:00:00', endAt: '2026-10-16T00:00:00' },
      { startAt: '2026-10-16T02:00:00', endAt: '2026-10-16T03:00:00' }
    ] });
    expect(hours).toEqual(Array.from({ length: 15 }, (_, i) => i + 7));
  });
  it('shows cross-midnight events on both dates, clipping each at midnight', () => {
    const items = [{ startAt: '2026-10-14T23:30:00', endAt: '2026-10-15T01:00:00' }];
    expect(visibleScheduleHours({ dates, items })[0]).toBe(0);
    expect(visibleScheduleHours({ dates: ['2026-10-14'], items }).at(-1)).toBe(23);
    expect(visibleScheduleHours({ dates: ['2026-10-16'], items })[0]).toBe(7);
  });
  it('uses browser-local instants, including UTC events crossing the date boundary', () => {
    const start = new Date(2026, 9, 15, 5, 15).toISOString();
    const end = new Date(2026, 9, 15, 6).toISOString();
    expect(visibleScheduleHours({ dates, items: [{ startAt: start, endAt: end }] })[0]).toBe(5);
  });
  it('allows explicitly showing all 24 hours with no events', () => {
    expect(visibleScheduleHours({ showAllHours: true })).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });
  it('shows an all-day item once on each included day with an exclusive end', () => {
    const item = { allDay: true, startDate: '2026-10-14', endDate: '2026-10-16' };
    expect(allDayItemOccursOn(item, '2026-10-14')).toBe(true);
    expect(allDayItemOccursOn(item, '2026-10-15')).toBe(true);
    expect(allDayItemOccursOn(item, '2026-10-16')).toBe(false);
  });
});
