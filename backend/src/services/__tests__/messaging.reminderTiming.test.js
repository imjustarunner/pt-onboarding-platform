import { expect, it } from 'vitest';
import { messageReminderDueAt, isMessageReminderWindow } from '../../utils/messageReminderTiming.js';
const due = (received, options) => messageReminderDueAt(received, options).toISOString();
it('preserves Friday 4 p.m. through the weekend until Monday 4 p.m.', () => {
  expect(due('2026-09-18T16:00:00-06:00')).toBe('2026-09-21T22:00:00.000Z');
});
it('starts a Monday 6 p.m. arrival Tuesday morning and reminds Wednesday at 7 a.m.', () => {
  expect(due('2026-09-21T18:00:00-06:00')).toBe('2026-09-23T13:00:00.000Z');
});
it('starts early morning and weekend arrivals at the next opening', () => {
  expect(due('2026-09-21T05:00:00-06:00')).toBe('2026-09-22T13:00:00.000Z');
  expect(due('2026-09-19T10:00:00-06:00')).toBe('2026-09-22T13:00:00.000Z');
});
it('preserves the local clock over a daylight saving transition', () => {
  expect(due('2026-10-30T16:00:00-06:00')).toBe('2026-11-02T23:00:00.000Z');
});
it('uses the provider’s actual available days, hours, and timezone', () => {
  const schedule = { enabled: true, timezone: 'America/New_York', blocks: [1, 3, 5].map(dayOfWeek => ({ dayOfWeek, startMinutes: 8 * 60, endMinutes: 16 * 60 })) };
  expect(due('2026-09-21T18:00:00-04:00', { schedule })).toBe('2026-09-25T12:00:00.000Z');
  expect(due('2026-09-21T15:00:00-04:00', { schedule })).toBe('2026-09-23T19:00:00.000Z');
});
it('snaps a deadline in a break to the next available block', () => {
  const schedule = { enabled: true, timezone: 'America/Denver', blocks: [
    { dayOfWeek: 1, startMinutes: 7 * 60, endMinutes: 19 * 60 },
    { dayOfWeek: 2, startMinutes: 7 * 60, endMinutes: 12 * 60 },
    { dayOfWeek: 2, startMinutes: 14 * 60, endMinutes: 19 * 60 }
  ] };
  expect(due('2026-09-21T13:00:00-06:00', { schedule })).toBe('2026-09-22T20:00:00.000Z');
});
it('supports the saved two-business-day setting', () => {
  expect(due('2026-09-18T16:00:00-06:00', { delayHours: 48 })).toBe('2026-09-22T22:00:00.000Z');
});
it('delivers only during availability, with 7–7 weekday defaults even if general quiet hours are disabled', () => {
  const schedule = { enabled: false, timezone: 'America/Denver', blocks: [] };
  expect(isMessageReminderWindow(new Date('2026-09-21T06:59:00-06:00'), schedule)).toBe(false);
  expect(isMessageReminderWindow(new Date('2026-09-21T07:00:00-06:00'), schedule)).toBe(true);
  expect(isMessageReminderWindow(new Date('2026-09-21T18:59:00-06:00'), schedule)).toBe(true);
  expect(isMessageReminderWindow(new Date('2026-09-21T19:00:00-06:00'), schedule)).toBe(false);
  expect(isMessageReminderWindow(new Date('2026-09-20T12:00:00-06:00'), schedule)).toBe(false);
});
it('fails closed on missing or invalid received dates', () => {
  for (const value of ['invalid', null, undefined, '']) expect(Number.isNaN(messageReminderDueAt(value).getTime())).toBe(true);
});

import {personalMessageDueAt} from '../../utils/messageReminderTiming.js';
it('honors immediate and custom-hour choices without rounding up to a business day',()=>{
 const at=(date,mode,hours)=>personalMessageDueAt(date,{preferences:{personalEmailDelayMode:mode,personalEmailDelayHours:hours}}).toISOString();
 expect(at('2026-09-21T10:00:00-06:00','immediate',24)).toBe('2026-09-21T16:00:00.000Z');
 expect(at('2026-09-21T10:00:00-06:00','hours',2)).toBe('2026-09-21T18:00:00.000Z');
 expect(at('2026-09-21T18:00:00-06:00','hours',2)).toBe('2026-09-22T13:00:00.000Z');
 expect(at('2026-09-18T20:00:00-06:00','immediate',0)).toBe('2026-09-21T13:00:00.000Z');
 expect(at('2026-09-21T18:00:00-06:00','business_day',24)).toBe('2026-09-23T13:00:00.000Z');
});
