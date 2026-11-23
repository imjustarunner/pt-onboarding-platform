import { expect, it } from 'vitest';
import { calendarDisplayTimeZone, normalizeCalendarDisplayTimeZone } from '../calendarDisplayTimeZone.js';
import { calendarWallDate } from '../calendarWallClock.js';
import { wallDatetimeLocalToSummaryIso } from '../scheduleEventInstants.js';

it('retains office defaults and ignores invalid saved zones', () => {
  expect(calendarDisplayTimeZone({ office: 'America/Denver' })).toBe('America/Denver');
  expect(calendarDisplayTimeZone({ preferred: 'Bad/Zone', office: 'America/Denver' })).toBe('America/Denver');
  expect(normalizeCalendarDisplayTimeZone('Bad/Zone')).toBe('');
});
it('shows one unchanged Denver booking in Mountain, Eastern, Central or another chosen zone', () => {
  const event = Object.freeze({ startAt: '2026-11-24T19:00:00Z', endAt: '2026-11-24T20:00:00Z', timeZone: 'America/Denver', officeId: 7 });
  for (const [zone, hour] of [['America/Denver',12], ['America/New_York',14], ['America/Chicago',13], ['Europe/London',19]]) {
    const chosen = calendarDisplayTimeZone({ preferred: zone, office: event.timeZone });
    expect(calendarWallDate(event.startAt, chosen).getHours()).toBe(hour);
    expect(wallDatetimeLocalToSummaryIso(`2026-11-24T${hour}:00:00`, chosen)).toBe('2026-11-24T19:00:00.000Z');
  }
  expect(event).toEqual({ startAt: '2026-11-24T19:00:00Z', endAt: '2026-11-24T20:00:00Z', timeZone: 'America/Denver', officeId: 7 });
});
it('handles date boundaries and DST without changing an instant or room-clock view', () => {
  expect(calendarWallDate('2026-11-25T06:30:00Z','America/Denver').getDate()).toBe(24);
  expect(calendarWallDate('2026-11-25T06:30:00Z','America/New_York').getDate()).toBe(25);
  expect(calendarWallDate('2026-11-01T07:30:00Z','America/New_York').getHours()).toBe(2);
  expect(calendarWallDate('2026-11-01T07:30:00Z','America/Denver').getHours()).toBe(1);
  expect(calendarDisplayTimeZone({ preferred:'America/New_York',office:'America/Denver',officeLayout:true })).toBe('America/Denver');
});
