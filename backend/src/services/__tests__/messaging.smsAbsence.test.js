import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{listForUserInWindow:vi.fn()}}));
import pool from '../../config/database.js';
import Events from '../../models/ProviderScheduleEvent.model.js';
import Vacation from '../vacationScheduleSync.service.js';
import Settings from '../../models/UserCallSettings.model.js';
const now=new Date('2026-11-02T18:00:00Z');
const event={id:42,kind:'AWAY',start_at:'2026-11-02 18:00:00',end_at:'2026-11-02 19:00:00'};
beforeEach(()=>{vi.resetAllMocks();pool.execute.mockResolvedValue([[]]);Events.listForUserInWindow.mockResolvedValue([]);});
it('uses exact UTC start-inclusive/end-exclusive boundaries, not the entire day',async()=>{
 Events.listForUserInWindow.mockResolvedValue([event]);
 expect(await Vacation.getUserAbsence(7,450,new Date(now-1))).toBeNull();
 expect(await Vacation.getUserAbsence(7,450,now)).toEqual({key:'schedule:42'});
 expect(await Vacation.getUserAbsence(7,450,new Date('2026-11-02T19:00:00Z'))).toBeNull();
});
it('ignores ordinary off-hours, cancelled events, and other event types',async()=>{
 Events.listForUserInWindow.mockResolvedValue([{...event,kind:'AVAILABLE'},{...event,status:'CANCELLED'}]);
 expect(await Vacation.getUserAbsence(7,450,now)).toBeNull();
});
it('uses the local timezone for legacy all-day events across the November DST change',async()=>{
 Events.listForUserInWindow.mockResolvedValue([{id:9,kind:'VACATION',all_day:1,start_date:'2026-11-01',end_date:'2026-11-02',event_timezone:'America/Denver'}]);
 expect(await Vacation.getUserAbsence(7,450,new Date('2026-11-01T05:59:59Z'))).toEqual({key:'hours:default'});
 expect(await Vacation.getUserAbsence(7,450,new Date('2026-11-01T06:00:00Z'))).toEqual({key:'schedule:9'});
 expect(await Vacation.getUserAbsence(7,450,new Date('2026-11-02T06:59:59Z'))).toEqual({key:'schedule:9'});
 expect(await Vacation.getUserAbsence(7,450,new Date('2026-11-02T07:00:00Z'))).toEqual({key:'hours:default'});
});
it('keeps the manual absence identity stable until a new recorded absence',async()=>{
 pool.execute.mockResolvedValue([[{vacation_mode_enabled:1,vacation_mode_started_at:'2026-11-02 17:00:00.123456'}]]);
 expect(await Vacation.getUserAbsence(7,450,now)).toEqual(await Vacation.getUserAbsence(7,450,new Date('2026-11-03T18:00:00Z')));
 pool.execute.mockResolvedValue([[{vacation_mode_enabled:1,vacation_mode_started_at:'2026-11-04 17:00:00.123456'}]]);
 expect((await Vacation.getUserAbsence(7,450,now)).key).toContain('2026-11-04');
});
it.each([{}, {vacation_mode_enabled:true}, {vacation_mode_enabled:false}])('only changes the manual absence epoch for explicit vacation updates: %j',async patch=>{
 await Settings.upsertForUser(7,patch);
 const [sql,params]=pool.execute.mock.calls[0];
 expect(sql.match(/\?/g)).toHaveLength(params.length);
 expect(params.slice(-2)).toEqual(patch.vacation_mode_enabled===undefined?[0,0]:[1,1]);
 expect(sql).toContain('WHEN vacation_mode_enabled = 0 THEN UTC_TIMESTAMP(6)');
});
