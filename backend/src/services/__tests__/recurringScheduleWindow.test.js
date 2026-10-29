import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),google:vi.fn(),remove:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m,execute:m.execute}}));
vi.mock('../supervisionReviewTime.service.js',()=>({withSupervisorTimeLock:async(ids,fn)=>fn(m),assertNoReviewTimeOverlap:vi.fn()}));
vi.mock('../recurringScheduleCancellation.service.js',()=>({withRecurringScheduleEdit:async work=>work(m)}));
vi.mock('../googleCalendar.service.js',()=>({default:{upsertProviderPrimaryCalendarEvent:m.google,deleteEvent:m.remove}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://example.test'}));
import {maintainRecurringScheduleWindow,copyRecurringRoster,syncRecurringCalendars} from '../recurringScheduleWindow.service.js';
import {assertRecurringWindow,nextRecurringWindow,recurringWindowEnd} from '../../utils/recurringWindow.js';
let rows;
const session=(patch={})=>({id:1,agency_id:2,supervisor_user_id:7,supervisee_user_id:8,session_type:'individual',start_at:'2027-10-01 16:00:00',end_at:'2027-10-01 17:00:00',event_timezone:'America/Denver',recurrence_series_id:'series-a',recurrence_frequency:'WEEKLY',recurrence_policy:'INDEFINITE',recurrence_index:51,status:'SCHEDULED',...patch});
beforeEach(()=>{
 vi.resetAllMocks(); rows=[];
 m.execute.mockImplementation(async(sql,params=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT * FROM supervision_sessions'))return [rows];
  if(sql.startsWith('SELECT * FROM provider_schedule_events'))return [[]];
  if(sql.startsWith('SELECT MAX'))return [[{stopped:0}]];
  if(sql.startsWith('INSERT INTO supervision_sessions'))return [{insertId:20}];
  return [[]];
 });
});
it('uses a calendar year, including leap-day boundaries, and rejects far-future creation',()=>{
 expect(recurringWindowEnd(new Date('2028-02-29T18:00:00Z'))).toBe('2029-02-28');
 expect(()=>assertRecurringWindow({recurrenceSeriesId:'a',startAt:'2027-10-09 16:00:00'},new Date('2026-10-08T18:00:00Z'))).toThrow('next year');
 expect(()=>assertRecurringWindow({startAt:'2031-10-09 16:00:00'})).not.toThrow();
});
it('preserves 10am Denver through DST and month-end anchors',()=>{
 const a=session({start_at:'2026-10-30 16:00:00',end_at:'2026-10-30 17:00:00'});
 expect(nextRecurringWindow(a,a)).toMatchObject({day:'2026-11-06',startAt:'2026-11-06 17:00:00',endAt:'2026-11-06 18:00:00'});
 const monthly=session({start_at:'2026-01-31 17:00:00',end_at:'2026-01-31 18:00:00',recurrence_frequency:'MONTHLY'});
 const feb={...monthly,start_at:'2026-02-28 17:00:00',end_at:'2026-02-28 18:00:00'};
 expect(nextRecurringWindow(monthly,feb)).toMatchObject({day:'2026-03-31',startAt:'2026-03-31 16:00:00'});
});
it('holds existing 2031 dates without deleting their work or cloning attendance',async()=>{
 rows=[session({start_at:'2031-10-01 16:00:00',end_at:'2031-10-01 17:00:00'})];
 expect(await maintainRecurringScheduleWindow({now:new Date('2026-10-08T18:00:00Z')})).toEqual({held:1,restored:0,added:0});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('recurrence_horizon_held=1'))).toBe(true);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE')||sql.includes('INSERT INTO supervision_session_attendance'))).toBe(false);
});
it('restores a preserved occurrence within the year without making a second meeting',async()=>{
 rows=[session({status:'CANCELLED',recurrence_horizon_held:1,recurrence_policy:'FINITE'})];
 expect(await maintainRecurringScheduleWindow({now:new Date('2026-10-08T18:00:00Z')})).toEqual({held:0,restored:1,added:0});
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO supervision_sessions'))).toBe(false);
});
it('tops up an ongoing series silently and resets room/attendance state',async()=>{
 rows=[session({host_join_token:'old-secret',live_started_at:'old',finalized_at:null,meeting_settings_json:{reminders:[60]}})];
 expect(await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).toEqual({held:0,restored:0,added:1});
 const [sql,params]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO supervision_sessions'));
 expect(sql).not.toContain('live_started_at');expect(params).not.toContain('old-secret');
 expect(params).toContain('2027-10-08 16:00:00');
 expect(params).toContain('{"reminders":[60]}');
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('meeting_email_invitations')||sql.includes('notifications'))).toBe(false);
 expect(m.commit).toHaveBeenCalled();
});
it('never extends finite/stopped series or resurrects a user-cancelled occurrence',async()=>{
 for(const patch of [{recurrence_policy:'FINITE'},{recurrence_stopped:1},{status:'CANCELLED',recurrence_horizon_held:0}]){
  rows=[session(patch)]; expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).added).toBe(0);
 }
});
it('waits for the initial booking batch to finish before extending',async()=>{
 rows=[session({created_at:'2026-10-09 17:30:00'})];
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).added).toBe(0);
});
it('does not duplicate an occurrence that a prior attempt already saved',async()=>{
 rows=[session()];const base=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT id FROM')?[[{id:20}]]:base(sql,...args));
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).added).toBe(0);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO supervision_sessions'))).toBe(false);
});
it('keeps personal holds in one series when a single occurrence gains an agency',async()=>{
 const hold={provider_id:507,kind:'SCHEDULE_HOLD',status:'ACTIVE',recurrence_series_id:'personal-hold',recurrence_frequency:'EVERY_4_WEEKS',recurrence_policy:'INDEFINITE',event_timezone:'America/Denver'};
 const occurrences=[
  {...hold,id:386,agency_id:2,recurrence_index:0,start_at:'2026-11-03 21:00:00',end_at:'2026-11-03 22:00:00'},
  {...hold,id:398,agency_id:null,recurrence_index:12,start_at:'2027-10-05 20:00:00',end_at:'2027-10-05 21:00:00'}
 ];
 const base=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT * FROM provider_schedule_events')?[occurrences]:base(sql,...args));
 expect(await maintainRecurringScheduleWindow({now:new Date('2026-10-26T16:00:00Z')})).toEqual({held:0,restored:0,added:0});
 expect(m.beginTransaction).not.toHaveBeenCalled();
 expect(m.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
});
it('checks existing personal hold dates across agency metadata while preserving provider scope',async()=>{
 const hold={id:8,agency_id:2,provider_id:7,kind:'SCHEDULE_HOLD',status:'ACTIVE',recurrence_series_id:'personal-hold',recurrence_frequency:'WEEKLY',recurrence_policy:'INDEFINITE',event_timezone:'America/Denver',start_at:'2027-10-01 16:00:00',end_at:'2027-10-01 17:00:00'};
 const base=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,params=[])=>{
  if(sql.startsWith('SELECT * FROM provider_schedule_events'))return [[hold]];
  if(sql.startsWith('SELECT id FROM provider_schedule_events'))return [[{id:9}]];
  return base(sql,params);
 });
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).added).toBe(0);
 const [sql,params]=m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT id FROM provider_schedule_events'));
 expect(sql).toContain("kind='SCHEDULE_HOLD' AND client_id IS NULL AND provider_id=? AND recurrence_series_id=?");
 expect(sql).not.toContain('agency_id');
 expect(params).toEqual([7,'personal-hold','2027-10-08 16:00:00']);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('copies mandatory/cohost settings but not RSVP responses or presenter assignments',async()=>{
 await copyRecurringRoster(m,'meeting',1,20);
 const sql=m.execute.mock.calls.map(([sql])=>sql).join('\n');
 expect(sql).toContain('is_required,is_cohost');expect(sql).not.toContain('rsvp');expect(sql).not.toContain('presenter');
});
it('rolls back a failed roster write and releases its worker lock',async()=>{
 rows=[session()];
 const base=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,...args)=>{if(sql.startsWith('INSERT INTO supervision_session_attendees'))throw new Error('roster failed');return base(sql,...args);});
 expect(await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).toMatchObject({added:0,deferred:1});
 expect(m.rollback).toHaveBeenCalled();expect(m.release).toHaveBeenCalled();
});
it('calendar retries use stable IDs and no invitation emails',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT e.*')&&sql.includes('supervision_sessions') ? [[session({recurrence_calendar_pending:1,host_email:'host@example.test'})]] : [[]]);
 m.google.mockResolvedValue({ok:true,googleEventId:'stable'});
 await syncRecurringCalendars();
 expect(m.google).toHaveBeenCalledWith(expect.objectContaining({stableInsertId:'reca1d0',sendUpdates:'none',disableReminders:true,startAt:'2027-10-01 16:00:00'}));
});
it('deletes a silent Google copy even if cancellation followed a crash before its ID was saved',async()=>{
 const row=session({status:'CANCELLED',recurrence_series_id:'series',recurrence_calendar_pending:1,recurrence_calendar_generation:1,google_event_id:null,host_email:'host@example.test'});
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT e.*')&&sql.includes('supervision_sessions')?[[row]]:[[]]);
 m.remove.mockResolvedValue({ok:true});
 await syncRecurringCalendars();
 expect(m.remove.mock.calls.map(([args])=>args.eventId)).toEqual(['reca1d1','reca1d0']);
 expect(m.google).not.toHaveBeenCalled();
});
it('reloads cancellation state under the shared lock before syncing a queued active occurrence',async()=>{
 let reads=0;
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT e.*')&&sql.includes('supervision_sessions')) {
   reads++;return [[session({status:reads===1?'SCHEDULED':'CANCELLED',google_event_id:'remote',host_email:'host@example.test'})]];
  }
  return [[]];
 });
 m.remove.mockResolvedValue({ok:true});await syncRecurringCalendars();
 expect(m.google).not.toHaveBeenCalled();expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({eventId:'remote',sendUpdates:'none'}));
});
it('does not extend the old weekday after a this-and-future move',async()=>{
 const settings={recurrenceContinuationFrom:'2027-10-08 16:00:00'};
 rows=[session({start_at:'2027-10-01 16:00:00',end_at:'2027-10-01 17:00:00',meeting_settings_json:settings})];
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).added).toBe(0);
});
it('extends from the original weekday after a single-date move without cloning the exception',async()=>{
 rows=[session({start_at:'2027-10-02 18:00:00',end_at:'2027-10-02 19:00:00',meeting_settings_json:{recurrenceOriginalStartAt:'2027-10-01 16:00:00',recurrenceOriginalEndAt:'2027-10-01 17:00:00',reminders:[60]}})];
 expect((await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')})).added).toBe(1);
 const [,params]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO supervision_sessions'));
 expect(params).toContain('2027-10-08 16:00:00');expect(params).toContain('{"reminders":[60]}');expect(JSON.stringify(params)).not.toContain('recurrenceOriginalStartAt');
});

it('gives each renewed signup-only date its own deadline and does not register last week’s participants',async()=>{
 rows=[session({session_type:'group',enrollment_mode:'signup_only',signup_closes_at:'2027-10-01 15:00:00'})];
 await maintainRecurringScheduleWindow({now:new Date('2026-10-09T18:00:00Z')});
 const [sql,values]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO supervision_sessions'));
 expect(sql).toContain('signup_closes_at');expect(values).toContain('2027-10-08 15:00:00');expect(values).not.toContain('2027-10-01 15:00:00');
 const [copy]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO supervision_session_attendees'));
 expect(copy).toContain("COALESCE(s.enrollment_mode,'invited')<>'signup_only' OR a.participant_role IN ('supervisor','co_facilitator')");
});

// Exercise the real adapter conversion, not just a mocked Google call's shape.
it.each([
 ['2026-10-20 18:00:00','2026-10-20T12:00:00'],
 ['2026-11-03 19:00:00','2026-11-03T12:00:00']
])('keeps Denver noon after the Google round trip: %s',async(start,wall)=>{
 const {utcToRfc3339Wall}=await import('../../utils/officeEventDateTime.util.js');
 const row=session({start_at:start,end_at:start.replace(/:00:00$/,':45:00'),recurrence_calendar_pending:1,host_email:'host@example.test'});
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT e.*')&&sql.includes('supervision_sessions')?[[row]]:[[]]);
 m.google.mockImplementation(async args=>{
  expect(utcToRfc3339Wall(args.startAt,args.timeZone)).toBe(wall);
  return {ok:true,googleEventId:'stable'};
 });
 await syncRecurringCalendars();expect(m.google).toHaveBeenCalledOnce();
});
