import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),append:vi.fn(),available:vi.fn(),review:vi.fn()}));
vi.mock('../recurringScheduleCancellation.service.js',()=>({withRecurringScheduleEdit:fn=>fn(m)}));
vi.mock('../recurringScheduleWindow.service.js',()=>({appendOccurrence:m.append}));
vi.mock('../meetingWindowConflict.service.js',()=>({withMeetingWindow:(_args,fn)=>fn(m)}));
vi.mock('../appointmentConflict.service.js',()=>({assertAppointmentWindowAvailable:m.available}));
vi.mock('../supervisionReviewTime.service.js',()=>({assertNoReviewTimeOverlap:m.review}));
import {makeSupervisionRecurring,supervisionRecurrencePlan} from '../supervisionRecurrenceEdit.service.js';
let row;
const now=new Date('2026-10-19T18:00:00Z');
beforeEach(()=>{
 vi.resetAllMocks();row={id:363,agency_id:2,supervisor_user_id:507,supervisee_user_id:483,session_type:'individual',status:'FINALIZED',finalized_at:'2026-10-13 20:00:00',start_at:'2026-10-13 18:00:00',end_at:'2026-10-13 19:00:00',event_timezone:'America/Denver'};
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT *')?[[row]]:sql.startsWith('SELECT user_id')?[[{user_id:483}]]:[{}]);
 m.append.mockImplementation(async(_db,_kind,_template,_window,index)=>1000+index);
});
it('plans weekly and biweekly in Denver wall time across DST without creating past attendance',()=>{
 const weekly=supervisionRecurrencePlan(row,{frequency:'WEEKLY',policy:'FINITE',occurrenceCount:4,now});
 expect(weekly.map(w=>w.startAt)).toEqual(['2026-10-20 18:00:00','2026-10-27 18:00:00','2026-11-03 19:00:00']);
 expect(supervisionRecurrencePlan(row,{frequency:'BIWEEKLY',policy:'FINITE',occurrenceCount:3,now}).map(w=>w.startAt)).toEqual(['2026-10-27 18:00:00','2026-11-10 19:00:00']);
});
it('atomically links the historical session and appends clean future occurrences',async()=>{
 const result=await makeSupervisionRecurring({id:363,frequency:'WEEKLY',policy:'FINITE',occurrenceCount:4,actorUserId:507,details:{modality:'virtual',notify_participants:0,reminder_minutes:30,status:'CANCELLED'},now});
 expect(result.createdIds).toEqual([1001,1002,1003]);expect(m.commit).toHaveBeenCalledOnce();
 const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE supervision_sessions'));
 expect(sql).not.toMatch(/SET status|finalized_at|attendance|duration/);expect(args[1]).toBe('WEEKLY');
 expect(m.available.mock.calls.map(([,x])=>x.providerUserId)).toEqual([507,483,507,483,507,483]);
 expect(m.append.mock.calls[0][2]).toMatchObject({id:363,recurrence_frequency:'WEEKLY',created_by_user_id:507,modality:'virtual',notify_participants:0,reminder_minutes:30,status:'FINALIZED'});
});
it('fails without saving any dates when a later occurrence conflicts',async()=>{
 m.available.mockImplementation(async(_db,window)=>{if(window.startAt==='2026-11-03 19:00:00')throw Object.assign(new Error('Conflict'),{status:409});});
 await expect(makeSupervisionRecurring({id:363,frequency:'WEEKLY',policy:'FINITE',occurrenceCount:4,actorUserId:507,now})).rejects.toThrow('Conflict');
 expect(m.append).not.toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();expect(m.rollback).toHaveBeenCalledOnce();
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('rolls back if insertion fails and treats a repeated conversion as idempotent',async()=>{
 m.append.mockRejectedValueOnce(new Error('insert failed'));
 await expect(makeSupervisionRecurring({id:363,frequency:'WEEKLY',policy:'FINITE',occurrenceCount:3,now})).rejects.toThrow('insert failed');
 expect(m.rollback).toHaveBeenCalledOnce();row.recurrence_series_id='existing';row.recurrence_frequency='WEEKLY';
 expect(await makeSupervisionRecurring({id:363,frequency:'WEEKLY',now})).toEqual({createdIds:[],alreadyRecurring:true});
});
it('rejects invalid recurrence and historical time changes without changing the completed record',async()=>{
 expect(()=>supervisionRecurrencePlan(row,{frequency:'DAILY',now})).toThrow('supported');
 expect(()=>supervisionRecurrencePlan(row,{frequency:'WEEKLY',policy:'FINITE',occurrenceCount:0,now})).toThrow('2 and 53');
 await expect(makeSupervisionRecurring({id:363,frequency:'WEEKLY',startAt:'2026-10-13 19:00:00',now})).rejects.toThrow('completed session');
 expect(m.beginTransaction).not.toHaveBeenCalled();
});
