import {describe,it,expect} from 'vitest';
import {calendarWeekDays,calendarSlotIso,calendarSelection,movedCalendarTime} from '../familyCalendarInteraction';
const tz='America/Denver';
describe('family calendar interactions',()=>{
 it('supports Monday/Sunday starts, weekends and year boundaries',()=>{
  expect(calendarWeekDays('2026-09-22')[0]).toBe('2026-09-21');
  expect(calendarWeekDays('2026-09-22',0)[0]).toBe('2026-09-20');
  expect(calendarWeekDays('2026-09-22',1,false)).toEqual(['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25']);
  expect(calendarWeekDays('2027-01-01')[0]).toBe('2026-12-28');
 });
 it('uses household timezone and rolls late slots into tomorrow',()=>{
  expect(calendarSlotIso('2026-09-22',9*60,tz)).toBe('2026-09-22T15:00:00.000Z');
  expect(calendarSlotIso('2026-09-22',1440,tz)).toBe('2026-09-23T06:00:00.000Z');
 });
 it('rejects nonexistent spring-forward slots',()=>{
  expect(()=>calendarSlotIso('2026-03-08',150,tz)).toThrow('clocks change');
 });
 it('creates an hour on tap, and includes the selected final quarter-hour on drag',()=>{
  const tap=calendarSelection({day:'2026-09-22',minute:600},{day:'2026-09-22',minute:600},tz,false);
  expect(new Date(tap.end)-new Date(tap.start)).toBe(3600000);
  const forward=calendarSelection({day:'2026-09-22',minute:600},{day:'2026-09-22',minute:660},tz);
  const reverse=calendarSelection({day:'2026-09-22',minute:660},{day:'2026-09-22',minute:600},tz);
  expect(forward).toEqual(reverse);expect(new Date(forward.end)-new Date(forward.start)).toBe(75*60000);
 });
 it('moves across days while preserving where the event was grabbed and its duration',()=>{
  const event={start:'2026-09-22T15:00:00.000Z',end:'2026-09-22T16:30:00.000Z'};
  expect(movedCalendarTime(event,{day:'2026-09-22',minute:570},{day:'2026-09-23',minute:630},tz)).toEqual({start:'2026-09-23T16:00:00.000Z',end:'2026-09-23T17:30:00.000Z'});
 });
 it('resize keeps start fixed and enforces a fifteen-minute minimum',()=>{
  const event={start:'2026-09-22T15:00:00.000Z',end:'2026-09-22T16:30:00.000Z'};
  expect(movedCalendarTime(event,{}, {day:'2026-09-22',minute:480},tz,true)).toEqual({start:event.start,end:'2026-09-22T15:15:00.000Z'});
 });
 it('preserves elapsed duration when moving over daylight saving changes',()=>{
  const event={start:calendarSlotIso('2026-10-31',90,tz),end:calendarSlotIso('2026-10-31',150,tz)};
  const moved=movedCalendarTime(event,{day:'2026-10-31',minute:90},{day:'2026-11-01',minute:90},tz);
  expect(new Date(moved.end)-new Date(moved.start)).toBe(3600000);
 });
});
