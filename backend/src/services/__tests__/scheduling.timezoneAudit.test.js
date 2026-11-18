import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { clientScheduleInstantToUtcMysql, utcMysqlToIso, utcMysqlToZonedWallMysql } from '../../utils/zonedWallTime.util.js';
import { expandAppointmentRecurrence } from '../../utils/appointmentRecurrence.js';
import { shiftedAppointmentWindow } from '../../utils/appointmentSeriesMove.js';
import { providerScheduleCalendarTiming } from '../../utils/providerScheduleCalendar.js';
import { desiredOccurrencesFromEventRow, materializeSessionsForEvent } from '../companyEventSessionDates.service.js';
import { computeNextOccurrence, buildEventIcs, makeGoogleCalendarUrl } from '../companyEvents.service.js';

describe('schedule input, storage, and display boundaries', () => {
  it.each([
    ['America/Denver', '2026-07-20T17:00:00', '2026-07-20 23:00:00'],
    ['America/Denver', '2026-11-19T17:00:00', '2026-11-20 00:00:00'],
    ['America/Denver', '2026-11-19T23:45:00', '2026-11-20 06:45:00'],
    ['America/Denver', '2026-03-08T01:30:00', '2026-03-08 08:30:00'],
    ['America/Denver', '2026-03-08T03:30:00', '2026-03-08 09:30:00'],
    ['America/New_York', '2026-11-19T17:00:00', '2026-11-19 22:00:00'],
    ['Pacific/Auckland', '2026-11-19T09:00:00', '2026-11-18 20:00:00'],
    ['Asia/Kolkata', '2026-11-19T17:15:00', '2026-11-19 11:45:00']
  ])('round-trips %s %s through UTC without changing the entered local time', (zone, local, utc) => {
    expect(clientScheduleInstantToUtcMysql(local, zone)).toBe(utc);
    expect(utcMysqlToZonedWallMysql(utc, zone)).toBe(local.replace('T', ' '));
    expect(utcMysqlToIso(utc)).toBe(utc.replace(' ', 'T') + '.000Z');
  });
  it.each(['2026-11-20T00:00:00Z', '2026-11-19T17:00:00-07:00', new Date('2026-11-20T00:00:00Z')])('keeps an absolute instant absolute for all event timezone choices (%s)', value => {
    for (const zone of ['America/Denver', 'America/New_York', 'Pacific/Auckland']) expect(clientScheduleInstantToUtcMysql(value, zone)).toBe('2026-11-20 00:00:00');
  });
  it.each(['2026-03-08T02:30:00', '2026-02-30T17:00:00', 'not-a-date'])('rejects a nonexistent local time or invalid date instead of changing the appointment (%s)', value => {
    expect(clientScheduleInstantToUtcMysql(value, 'America/Denver')).toBeNull();
  });
});

describe('every timed provider-calendar kind uses the same saved UTC contract', () => {
  it.each(['PERSONAL_EVENT', 'SCHEDULE_HOLD', 'INDIRECT_SERVICES', 'TEAM_MEETING', 'HUDDLE', 'OUTREACH_TRIP'])('preserves %s time through Google synchronization', kind => {
    const timing = providerScheduleCalendarTiming({ kind, start_at: '2026-11-20 00:00:00', end_at: new Date('2026-11-20T01:00:00Z'), event_timezone: 'America/Denver' });
    expect(timing).toMatchObject({ startAt: '2026-11-20T00:00:00.000Z', endAt: '2026-11-20T01:00:00.000Z', timeZone: 'America/Denver' });
  });
  it('keeps date-only all-day entries as dates', () => {
    expect(providerScheduleCalendarTiming({ all_day: 1, start_date: '2026-11-19', end_date: '2026-11-20', event_timezone: 'America/Denver' }))
      .toMatchObject({ allDay: true, startAt: null, endAt: null, startDate: '2026-11-19', endDate: '2026-11-20' });
  });
});

it('keeps weekly appointment starts at 5 PM across the autumn offset change', () => {
  const occurrences = expandAppointmentRecurrence({ startAt: '2026-10-27T17:00:00', endAt: '2026-10-27T18:00:00', recurrence: 'WEEKLY', occurrenceCount: 3, timeZone: 'America/Denver' });
  expect(occurrences.map(row => clientScheduleInstantToUtcMysql(row.startAt, 'America/Denver')))
    .toEqual(['2026-10-27 23:00:00', '2026-11-04 00:00:00', '2026-11-11 00:00:00']);
});
it('moves a whole timed series onto its new weekday and retains the local hour after DST', () => {
  const window = shiftedAppointmentWindow('2026-11-04 00:00:00', { originalStartAt: '2026-10-27 23:00:00', startAt: '2026-10-29 23:00:00', endAt: '2026-10-30 00:00:00', timeZone: 'America/Denver' });
  expect(window).toEqual({ startAt: '2026-11-06 00:00:00', endAt: '2026-11-06 01:00:00' });
});

const event = { id: 9, title: 'Evening program', timezone: 'America/Denver', startsAt: '2026-10-27 00:00:00', endsAt: '2026-11-10 02:00:00', recurrence: { frequency: 'weekly', untilDate: '2026-11-09' } };
it('materializes company/program sessions on the local weekday even when their UTC date is the next day', () => {
  const rows = desiredOccurrencesFromEventRow({ starts_at: event.startsAt, ends_at: event.endsAt, timezone: event.timezone, recurrence_json: event.recurrence });
  expect(rows.map(row => [row.sessionDate, row.startsAt.toISOString()])).toEqual([
    ['2026-10-26', '2026-10-27T00:00:00.000Z'], ['2026-11-02', '2026-11-03T01:00:00.000Z'], ['2026-11-09', '2026-11-10T01:00:00.000Z']
  ]);
});
it('finds the next company event at its local hour across DST', () => {
  const next = computeNextOccurrence(event, '2026-10-28T12:00:00Z');
  expect(next.startsAt.toISOString()).toBe('2026-11-03T01:00:00.000Z');
  expect(next.endsAt.toISOString()).toBe('2026-11-03T02:00:00.000Z');
});
it('exports recurring events with a real timezone and the correct local end-of-day recurrence boundary', () => {
  const ics = buildEventIcs(event);
  expect(ics).toContain('DTSTART;TZID=America/Denver:20261026T180000');
  expect(ics).toContain('DTEND;TZID=America/Denver:20261026T190000');
  expect(ics).toContain('UNTIL=20261110T065959Z');
  const url = new URL(makeGoogleCalendarUrl(event));
  expect(url.searchParams.get('ctz')).toBe('America/Denver');
  expect(url.searchParams.get('dates')).toBe('20261026T180000/20261026T190000');
});

import { scheduleWeekWindow } from '../../utils/scheduleWeekWindow.js';
import ical from 'node-ical';
it.each([
  ['2026-11-16', 'America/Denver', '2026-11-16 07:00:00', '2026-11-23 07:00:00', 168],
  ['2026-03-02', 'America/Denver', '2026-03-02 07:00:00', '2026-03-09 06:00:00', 167],
  ['2026-10-26', 'America/Denver', '2026-10-26 06:00:00', '2026-11-02 07:00:00', 169],
  ['2026-11-16', 'Pacific/Auckland', '2026-11-15 11:00:00', '2026-11-22 11:00:00', 168]
])('queries the complete local calendar week %s in %s', (week, zone, start, end, hours) => {
  const result = scheduleWeekWindow(week, zone);
  expect(result).toMatchObject({windowStart: start, windowEnd: end});
  expect((Date.parse(result.timeMaxIso) - Date.parse(result.timeMinIso)) / 3600000).toBe(hours);
});
it('includes Sunday evening in the Mountain week, and early Monday in Auckland', () => {
  for (const [zone, local] of [['America/Denver','2026-11-22T23:30:00'],['Pacific/Auckland','2026-11-16T00:30:00']]) {
    const window = scheduleWeekWindow('2026-11-16', zone), at = clientScheduleInstantToUtcMysql(local, zone);
    expect(at >= window.windowStart && at < window.windowEnd).toBe(true);
  }
});
it('rejects invalid timezone names rather than silently scheduling in Mountain time', () => {
  expect(clientScheduleInstantToUtcMysql('2026-11-19T17:00:00', 'Invalid/Zone')).toBeNull();
  expect(() => scheduleWeekWindow('2026-11-16', 'Invalid/Zone')).toThrow('timezone');
});
it.each(['-06:00','-07:00'])('preserves the explicitly selected repeated autumn hour %s', offset => {
  const input = {startAt:`2026-11-01T01:15:00${offset}`,endAt:`2026-11-01T01:45:00${offset}`,timeZone:'America/Denver'};
  expect(expandAppointmentRecurrence(input)).toEqual([{startAt:input.startAt,endAt:input.endAt}]);
});
it('accepts a valid session spanning the autumn clock rollback', () => {
  const input = {startAt:'2026-11-01T01:45:00-06:00',endAt:'2026-11-01T01:15:00-07:00',timeZone:'America/Denver'};
  expect(expandAppointmentRecurrence(input)).toHaveLength(1);
});
it('rejects moving a recurring occurrence into the nonexistent spring-forward hour', () => {
  expect(() => shiftedAppointmentWindow('2026-03-01 09:30:00',{originalStartAt:'2026-03-01 09:30:00', startAt:'2026-03-01 09:30:00',endAt:'2026-03-01 10:30:00',timeZone:'America/Denver'})).not.toThrow();
  expect(() => shiftedAppointmentWindow('2026-03-08 10:30:00',{originalStartAt:'2026-03-01 10:30:00',startAt:'2026-03-01 09:30:00',endAt:'2026-03-01 10:30:00',timeZone:'America/Denver'})).toThrow('nonexistent');
});
it('embeds timezone observances and imports the same company recurrence across DST', () => {
  const content = buildEventIcs(event);
  expect(content).toContain('BEGIN:VTIMEZONE');
  expect(content).toContain('TZOFFSETFROM:-0600\r\nTZOFFSETTO:-0700');
  const parsed = Object.values(ical.sync.parseICS(content)).find(row => row.type === 'VEVENT');
  expect(parsed.rrule.all().map(date => date.toISOString())).toEqual(['2026-10-27T00:00:00.000Z','2026-11-03T01:00:00.000Z','2026-11-10T01:00:00.000Z']);
});

import { officeAvailabilityWindows } from '../officeAvailabilityWindow.service.js';
import { googleEventBody, renderCalendar, uniqueOfficeReservations } from '../calendarPublicationPolicy.js';
it('preserves absolute office availability inputs and shifts later dates in local time across DST', () => {
  expect(officeAvailabilityWindows('2026-10-27T23:00:00Z','2026-10-28T00:00:00Z','WEEKLY',2,'America/Denver').map(row=>row.startAt))
    .toEqual(['2026-10-27 23:00:00','2026-11-04 00:00:00']);
  expect(officeAvailabilityWindows('2026-03-08T02:30:00','2026-03-08T03:30:00','ONCE',1,'America/Denver')).toEqual([]);
});
it('exports stored MySQL UTC times unchanged in subscriptions and Google calendars', () => {
  const row={key:'test',title:'Session',start:'2026-11-20 00:00:00',end:'2026-11-20 01:00:00'};
  expect(googleEventBody(row)).toMatchObject({start:{dateTime:'2026-11-20T00:00:00.000Z'},end:{dateTime:'2026-11-20T01:00:00.000Z'}});
  expect(renderCalendar('Test',[row])).toContain('DTSTART:20261120T000000Z');
  expect(uniqueOfficeReservations([{id:1,start_at:row.start,end_at:row.end},{id:2,start_at:new Date('2026-11-20T00:00:00Z'),end_at:new Date('2026-11-20T01:00:00Z')}])).toHaveLength(1);
});

it('preserves protected future program sessions instead of inserting a competing timezone-corrected copy', async () => {
  const protectedSession={id:15,session_date:'2031-10-28',starts_at:'2031-10-29 00:00:00'};
  const db={execute:vi.fn(async sql=>sql.includes('FROM company_events')
    ? [[{id:9,starts_at:'2031-10-28 00:00:00',ends_at:'2031-10-28 02:00:00',timezone:'America/Denver'}]]
    : sql.startsWith('DELETE') ? [{affectedRows:0}] : [[protectedSession]])};
  await materializeSessionsForEvent(db,{companyEventId:9});
  expect(db.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO'))).toBe(false);
  const deletion=db.execute.mock.calls.find(([sql])=>sql.startsWith('DELETE'))[0];
  expect(deletion).toContain('starts_at>UTC_TIMESTAMP()');
  expect(deletion).toContain('NOT EXISTS(SELECT 1 FROM company_event_session_providers');
});

it('finds the current local occurrence in a company series created years earlier',()=>{
 const next=computeNextOccurrence({...event,startsAt:'2020-10-27 00:00:00',endsAt:'2030-11-10 02:00:00',recurrence:{frequency:'weekly'}},'2026-11-18T15:00:00Z');
 expect(next.startsAt.toISOString()).toBe('2026-11-24T01:00:00.000Z');
});
it('uses the configured weekday for the first upcoming program occurrence',()=>{
 const next=computeNextOccurrence({...event,recurrence:{frequency:'weekly',byWeekday:[4]}},'2026-10-20T12:00:00Z');
 expect(next.startsAt.toISOString()).toBe('2026-10-30T00:00:00.000Z');
});
it('bounds a recurring calendar export to the program event window when no separate until date was set',()=>{
 const content=buildEventIcs({...event,recurrence:{frequency:'weekly'}});
 expect(content).toContain('UNTIL=20261110T065959Z');
});
