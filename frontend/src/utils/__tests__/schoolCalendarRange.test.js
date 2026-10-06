import { describe, expect, it } from 'vitest';
import { buildSchoolCalendarRange, schoolCalendarDayKeys, schoolCalendarOverlaps } from '../schoolCalendarRange';
import { formatSchoolEventWhen, isoToZonedDatetimeLocal } from '../timezones';

const timezone = 'America/Denver';
const allDayRange = (date, endDate) => ({ ...buildSchoolCalendarRange({ date, endDate, timezone, allDay: true }), timezone });

describe('school important date ranges', () => {
  it('includes all five days of fall break without spilling into the 24th', () => {
    const event = allDayRange('2026-10-19', '2026-10-23');
    expect(event.startsAt).toBe('2026-10-19T06:00:00.000Z');
    expect(event.endsAt).toBe('2026-10-24T05:59:59.000Z');
    expect(schoolCalendarDayKeys(event)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    expect(formatSchoolEventWhen(event.startsAt, event.endsAt, timezone)).toBe('Mon, Oct 19, 2026 – Fri, Oct 23, 2026 · All day');
    expect(isoToZonedDatetimeLocal(event.endsAt, timezone).slice(0, 10)).toBe('2026-10-23');
  });
  it('defaults to a single day and rejects a reversed date range', () => {
    expect(schoolCalendarDayKeys(allDayRange('2026-10-19'))).toEqual(['2026-10-19']);
    expect(buildSchoolCalendarRange({ date: '2026-10-23', endDate: '2026-10-19', allDay: true })).toBeNull();
  });
  it('includes a break already in progress at a month or week boundary across DST', () => {
    const event = allDayRange('2026-10-30', '2026-11-03');
    expect(schoolCalendarOverlaps(event, '2026-11-01', '2026-12-01')).toBe(true);
    expect(schoolCalendarOverlaps(event, '2026-11-02', '2026-11-09')).toBe(true);
    expect(schoolCalendarOverlaps(event, '2026-11-04', '2026-11-11')).toBe(false);
    expect(schoolCalendarDayKeys(event)).toHaveLength(5);
    expect(event.endsAt).toBe('2026-11-04T06:59:59.000Z');
  });
  it('supports timed overnight events and excludes a midnight end from the next day', () => {
    const range = buildSchoolCalendarRange({ date: '2026-10-19', endDate: '2026-10-20', startTime: '22:00', endTime: '00:00', timezone });
    expect(schoolCalendarDayKeys({ ...range, timezone })).toEqual(['2026-10-19']);
    expect(buildSchoolCalendarRange({ date: '2026-10-19', startTime: '19:00', endTime: '17:00', timezone })).toBeNull();
    expect(formatSchoolEventWhen(range.startsAt, range.endsAt, timezone)).toContain('Tue, Oct 20, 2026');
  });
});
