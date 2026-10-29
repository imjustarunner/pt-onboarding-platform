import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),google:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m,execute:m.execute}}));
vi.mock('../supervisionReviewTime.service.js',()=>({assertNoReviewTimeOverlap:vi.fn()}));
vi.mock('../googleCalendar.service.js',()=>({default:{upsertProviderPrimaryCalendarEvent:m.google,deleteEvent:vi.fn().mockResolvedValue({ok:true})}}));
import { maintainRecurringScheduleWindow, syncRecurringCalendars } from '../recurringScheduleWindow.service.js';
import { cancelMeetingOccurrences } from '../recurringScheduleCancellation.service.js';
import { nextRecurringWindow } from '../../utils/recurringWindow.js';
let rows, stop;
const block=(patch={})=>({id:1,agency_id:null,provider_id:7,kind:'SCHEDULE_HOLD',client_id:null,all_day:0,title:'Writing',description:'Keep this note',reason_code:'DOCUMENTATION',is_private:1,focus_session_enabled:1,start_at:'2027-10-05 19:00:00',end_at:'2027-10-05 20:00:00',event_timezone:'America/Denver',recurrence_series_id:'blocks',recurrence_frequency:'WEEKLY',recurrence_policy:'INDEFINITE',recurrence_index:100,status:'ACTIVE',...patch});
beforeEach(()=>{
 vi.resetAllMocks();rows=[];stop=0;
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT * FROM provider_schedule_events WHERE id=')) return [[rows.find(r=>r.id===args[0])]];
  if(sql.startsWith('SELECT * FROM provider_schedule_events')) return [rows];
  if(sql.startsWith('SELECT MAX'))return [[{stopped:stop,next_index:101}]];
  if(sql.startsWith('INSERT INTO provider_schedule_events'))return [{insertId:20}];
  return [[]];
 });
});
function inserts() {
 return m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO provider_schedule_events')).map(([sql,args])=>Object.fromEntries(sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map((c,i)=>[c,args[i]])));
}
it('extends Tuesday and Thursday blocks independently, retaining reason, privacy, notes and focus settings',async()=>{
 rows=[block(),block({id:2,start_at:'2027-10-07 19:00:00',end_at:'2027-10-07 20:00:00',recurrence_index:101})];
 expect(await maintainRecurringScheduleWindow({now:new Date('2026-10-15T18:00:00Z')})).toEqual({held:0,restored:0,added:2});
 expect(inserts().map(r=>r.start_at)).toEqual(['2027-10-12 19:00:00','2027-10-14 19:00:00']);
 expect(inserts().every(r=>r.reason_code==='DOCUMENTATION'&&r.description==='Keep this note'&&r.is_private===1&&r.focus_session_enabled===1&&!r.join_token&&r.agency_id===null)).toBe(true);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO provider_schedule_event_attendees'))).toBe(false);
 const seriesCheck=m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT MAX'));
 expect(seriesCheck[0]).toContain("kind='SCHEDULE_HOLD' AND client_id IS NULL AND provider_id=? AND recurrence_series_id=?");
 expect(seriesCheck[1]).toEqual([7,'blocks']);
});
it('extends an all-day block across DST using exclusive calendar end dates',async()=>{
 const row=block({all_day:1,start_at:null,end_at:null,start_date:'2026-10-27',end_date:'2026-10-28'});
 expect(nextRecurringWindow(row,row)).toMatchObject({startDate:'2026-11-03',endDate:'2026-11-04',startAt:'2026-11-03 07:00:00',endAt:'2026-11-04 07:00:00'});
 rows=[block({all_day:1,start_at:null,end_at:null,start_date:new Date('2027-10-05T00:00:00Z'),end_date:new Date('2027-10-06T00:00:00Z')})];
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-13T18:00:00Z')})).added).toBe(1);
 expect(inserts()[0]).toMatchObject({all_day:1,start_at:null,end_at:null,start_date:'2027-10-12',end_date:'2027-10-13'});
 const occurrenceCheck=m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT id FROM provider_schedule_events WHERE')&&sql.includes('start_date=?'));
 expect(occurrenceCheck[0]).toContain("kind='SCHEDULE_HOLD' AND client_id IS NULL AND provider_id=?");
 expect(occurrenceCheck[1]).toEqual([7,'blocks','2027-10-12']);
});
it('preserves the wall-clock time through DST and a monthly all-day anchor through February',()=>{
 const row=block({start_at:'2026-10-27 19:00:00',end_at:'2026-10-27 20:00:00'});
 expect(nextRecurringWindow(row,row)).toMatchObject({startAt:'2026-11-03 20:00:00',endAt:'2026-11-03 21:00:00'});
 const jan=block({all_day:1,start_at:null,end_at:null,start_date:'2027-01-31',end_date:'2027-02-01',recurrence_frequency:'MONTHLY'});
 const feb={...jan,start_date:'2027-02-28',end_date:'2027-03-01'};
 expect(nextRecurringWindow(jan,feb)).toMatchObject({startDate:'2027-03-31',endDate:'2027-04-01'});
});
it('does not renew finite or stopped blocks, or recreate an individually cancelled date',async()=>{
 for(const patch of [{recurrence_policy:'FINITE'},{recurrence_stopped:1}]) {
  rows=[block(patch)];expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-13T18:00:00Z')})).added).toBe(0);
 }
 rows=[block(),block({id:2,start_at:'2027-10-12 19:00:00',end_at:'2027-10-12 20:00:00',status:'CANCELLED'})];
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-20T18:00:00Z')})).added).toBe(1);
 expect(inserts()[0].start_at).toBe('2027-10-19 19:00:00');
});
it('defers a block extension over an app appointment',async()=>{
 rows=[block()];const base=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT id FROM appointments')?[[{id:90}]]:base(sql,...args));
 expect(await maintainRecurringScheduleWindow({now:new Date('2026-10-13T18:00:00Z')})).toMatchObject({added:0,deferred:1});
 expect(inserts()).toEqual([]);expect(m.rollback).toHaveBeenCalled();
});
it('checks for a stopped series again before inserting',async()=>{
 rows=[block()];stop=1;
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-13T18:00:00Z')})).added).toBe(0);expect(inserts()).toEqual([]);
});
it.each([false,true])('cancels only one block or stops all future extensions, including all-day=%s',async allDay=>{
 rows=[block(allDay?{all_day:1,start_at:null,end_at:null,start_date:'2027-10-05',end_date:'2027-10-06'}:{})];
 expect((await cancelMeetingOccurrences({kind:'meeting',eventId:1,scope:'single',actorUserId:7})).cancelledCount).toBe(1);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('SET recurrence_stopped=1'))).toBe(false);
 await cancelMeetingOccurrences({kind:'meeting',eventId:1,scope:'future',actorUserId:7});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('SET recurrence_stopped=1')&&sql.includes('agency_id <=> ?'))).toBe(true);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes("status='CANCELLED'")&&sql.includes('recurrence_calendar_pending=1'))).toBe(true);
 expect(m.commit).toHaveBeenCalledTimes(2);
});
it('syncs all-day blocks without joining links, guests, or exposing private notes',async()=>{
 const row=block({all_day:1,start_at:null,end_at:null,start_date:'2027-10-05',end_date:'2027-10-06',host_email:'person@example.test',recurrence_calendar_pending:1});
 m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.startsWith('SELECT e.*')&&sql.includes('provider_schedule_events')?[[row]]:[[]]);
 m.google.mockResolvedValue({ok:true,googleEventId:'block'});await syncRecurringCalendars();
 expect(m.google).toHaveBeenCalledWith(expect.objectContaining({summary:'Busy',description:null,allDay:true,startDate:'2027-10-05',endDate:'2027-10-06',sendUpdates:'none',disableReminders:true}));
});
