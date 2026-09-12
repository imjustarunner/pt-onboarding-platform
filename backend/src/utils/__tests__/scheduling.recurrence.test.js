import { describe, it, expect } from 'vitest';
import { expandAppointmentRecurrence } from '../appointmentRecurrence.js';
import { wallMysqlToUtcMysql } from '../zonedWallTime.util.js';
describe('recurring session instants', () => {
  it('preserves Denver wall time across daylight saving', () => {
    const rows = expandAppointmentRecurrence({ startAt: '2026-10-25 09:00:00', endAt: '2026-10-25 10:00:00', recurrence: 'WEEKLY', occurrenceCount: 2 });
    expect(rows.map((row) => wallMysqlToUtcMysql(row.startAt, 'America/Denver'))).toEqual(['2026-10-25 15:00:00', '2026-11-01 16:00:00']);
  });
  it('does not shift ISO instants when normalizing a one-off booking', () => {
    const [row] = expandAppointmentRecurrence({ startAt: '2026-09-11T18:00:00Z', endAt: '2026-09-11T19:00:00Z' });
    expect(wallMysqlToUtcMysql(row.startAt, 'America/Denver')).toBe('2026-09-11 18:00:00');
  });
  it('clamps month-end recurrence and supports overnight sessions', () => {
    const rows = expandAppointmentRecurrence({ startAt: '2026-01-31 23:00:00', endAt: '2026-02-01 00:00:00', recurrence: 'MONTHLY', occurrenceCount: 2 });
    expect(rows[1]).toEqual({ startAt: '2026-02-28 23:00:00', endAt: '2026-03-01 00:00:00' });
  });
  it('rejects invalid windows and unbounded series', () => {
    expect(() => expandAppointmentRecurrence({ startAt: '2026-01-01 10:00:00', endAt: '2026-01-01 09:00:00' })).toThrow('valid session');
    expect(() => expandAppointmentRecurrence({ recurrence: 'WEEKLY', occurrenceCount: 1000 })).toThrow('104');
  });
});
