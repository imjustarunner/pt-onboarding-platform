import {afterEach,expect,it,vi} from 'vitest';
import {calendarWallDate,calendarSessionState} from '../calendarWallClock.js';
import {wallDatetimeLocalToSummaryIso} from '../scheduleEventInstants.js';
afterEach(()=>vi.unstubAllEnvs());
it.each(['America/New_York','America/Los_Angeles','UTC'])('draws Denver appointments in Denver clock cells regardless of browser %s',browser=>{
 vi.stubEnv('TZ',browser);
 for(const [instant,hour,minute] of [['2026-10-30T21:00:00Z',15,0],['2026-11-01T14:00:00Z',7,0],['2026-11-02T17:15:00Z',10,15]]){
  const d=calendarWallDate(instant,'America/Denver');expect([d.getHours(),d.getMinutes()]).toEqual([hour,minute]);
 }
});
it('keeps the same selected local start across the November DST transition with different UTC offsets',()=>{
 const before=wallDatetimeLocalToSummaryIso('2026-10-30T09:00:00','America/Denver');
 const after=wallDatetimeLocalToSummaryIso('2026-11-02T09:00:00','America/Denver');
 expect(before).toBe('2026-10-30T15:00:00.000Z');expect(after).toBe('2026-11-02T16:00:00.000Z');
 expect(calendarWallDate(before,'America/Denver').getHours()).toBe(9);expect(calendarWallDate(after,'America/Denver').getHours()).toBe(9);
});
it('does not silently repair an appointment previously authored in Eastern time',()=>{
 const stored='2026-11-02T15:15:00Z';const displayed=calendarWallDate(stored,'America/Denver');
 expect([displayed.getHours(),displayed.getMinutes()]).toEqual([8,15]);expect(stored).toBe('2026-11-02T15:15:00Z');
 expect(calendarWallDate('2026-11-02 15:15:00','America/Denver').getHours()).toBe(8);
});
it('keeps Voided distinct from the canceled calendar-event flag and retains missed states',()=>{
 expect(calendarSessionState({isCancelled:true,appointmentStatus:'voided'})).toBe('Voided');
 expect(calendarSessionState({isCancelled:true,appointmentStatus:'late_canceled'})).toBe('Cancelled');
 expect(calendarSessionState({appointmentStatus:'no_show'})).toBe('Missed');
});
