import { expect, it } from 'vitest';
import { normalizeExchangeSchedule, exchangeScheduleLines, scheduleFromIntake } from '../clientExchangeSchedule.js';
import { buildExchangeEmail } from '../clientExchangeSummary.js';
it('preserves days, after school, PM, exact starts, and per-day ranges with a time zone', () => {
  const schedule = normalizeExchangeSchedule({ days: ['Monday', 'Friday'], periods: ['after_school', 'pm'], windows: [{ day: 'Monday', start: '15:30', end: '17:00' }, { day: 'Friday', start: '16:00' }], timezone: 'America/Denver', notes: 'Every other Friday' });
  const lines = exchangeScheduleLines(schedule);
  expect(lines).toContain('Monday: 3:30 PM–5:00 PM');
  expect(lines).toContain('Friday: 4:00 PM (specific start time)');
  const email = buildExchangeEmail({ listing: { preferences: { schedule } }, link: 'https://example.test/client-exchange' });
  for (const text of ['After school', 'PM', 'Monday: 3:30 PM–5:00 PM', 'America/Denver', 'Every other Friday']) expect(email.text).toContain(text);
});
it('rejects invalid times, backwards ranges, and missing time zones before posting', () => {
  for (const window of [{ start: '25:00' }, { start: '16:00', end: '15:00' }, { start: '15:00', end: '15:00' }, { day: 'Funday', start: '16:00' }]) expect(() => normalizeExchangeSchedule({ windows: [window], timezone: 'America/Denver' })).toThrow();
  expect(() => normalizeExchangeSchedule({ windows: [{ start: '16:00' }] })).toThrow('time zone');
  expect(() => normalizeExchangeSchedule({ timezone: 'nowhere' })).toThrow('time zone');
});
it('carries existing intake preferences into a one-click post without guessing specific clock times', () => {
  expect(scheduleFromIntake({ preferredDays: ['monday'], preferredTimeOfDay: 'after school' })).toMatchObject({ days: ['Monday'], periods: ['after_school'], windows: [] });
  const schedule = { days: ['Tuesday'], periods: ['pm'], windows: [] };
  expect(scheduleFromIntake({ exchangeSchedule: schedule, preferredDays: ['Monday'] })).toEqual(schedule);
});
