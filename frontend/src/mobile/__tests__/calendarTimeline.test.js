import {describe,expect,it} from 'vitest';
import {calendarInitialMinute,calendarMinute,layoutMobileCalendar,shiftCalendarDay} from '../mobileCalendar.js';
describe('mobile day timeline',()=>{
 it('starts at 7am without an event and before the first event in the selected local day',()=>{expect(calendarInitialMinute([],'2026-11-11','America/Denver')).toBe(420);expect(calendarInitialMinute([{startAt:'2026-11-11T16:15:00Z',endAt:'2026-11-11T17:15:00Z'}],'2026-11-11','America/Denver')).toBe(525);});
 it('interprets UTC storage consistently through DST and calendar navigation',()=>{expect(calendarMinute('2026-11-11 07:00:00','America/Denver')).toEqual({day:'2026-11-11',minute:0});expect(calendarMinute('2026-11-01T07:30:00Z','America/Denver')).toEqual({day:'2026-11-01',minute:90});expect(shiftCalendarDay('2026-11-01',-1)).toBe('2026-10-31');});
 it('keeps overlapping appointments readable and excludes events outside this day',()=>{const event=(id,start,end)=>({id,startAt:`2026-11-11T${start}:00Z`,endAt:`2026-11-11T${end}:00Z`});const rows=layoutMobileCalendar([event(1,'16:00','17:00'),event(2,'16:30','17:30'),event(3,'18:00','19:00'),{id:4,startAt:'2026-11-12T16:00:00Z',endAt:'2026-11-12T17:00:00Z'}],'2026-11-11','America/Denver');expect(rows).toHaveLength(3);expect(rows.slice(0,2).map(r=>[r.column,r.columns])).toEqual([[0,2],[1,2]]);expect(rows[2].columns).toBe(1);});
});
