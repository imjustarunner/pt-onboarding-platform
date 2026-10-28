import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),commit:vi.fn(),rollback:vi.fn(),beginTransaction:vi.fn(),seriesEdit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({...m,beginTransaction:vi.fn(),release:vi.fn()})}}));
vi.mock('../recurringScheduleCancellation.service.js',()=>({withRecurringScheduleEdit:work=>{m.seriesEdit();return work(m);}}));
vi.mock('../supervisionSignup.service.js',()=>({isSignupOpen:session=>session.signupOpen!==false}));
import {getSupervisionRsvp,saveSupervisionRsvp} from '../supervisionRsvp.service.js';
const session={id:1,status:'SCHEDULED',start_at:'2099-09-22 18:30:00',attendee_status:'INVITED',is_required:1};
beforeEach(()=>{vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[session]]:[{affectedRows:1}]);});
it('updates only the invited person’s RSVP without recording attendance',async()=>{await saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',reason:'Client appointment conflict'});expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['DECLINED','Client appointment conflict',1,2]);expect(m.commit).toHaveBeenCalledOnce();expect(m.execute.mock.calls.some(([sql])=>sql.includes('attendance_rollups'))).toBe(false);});
it('requires an active agency membership and existing attendee record',async()=>{m.execute.mockResolvedValue([[]]);await expect(saveSupervisionRsvp({sessionId:1,userId:99,response:'accepted'})).rejects.toMatchObject({status:410});expect(m.rollback).toHaveBeenCalled();expect(m.execute.mock.calls[0][0]).toContain('ua.agency_id=s.agency_id');});
it('allows an invited person to change a prior decline',async()=>{m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{...session,attendee_status:'DECLINED'}]]:[{affectedRows:1}]);await saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted'});expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['SIGNED_UP',null,1,2]);});
it('does not reopen closed signup or past supervision',async()=>{m.execute.mockResolvedValue([[{...session,enrollment_mode:'signup_only',signupOpen:false}]]);await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted'})).rejects.toMatchObject({status:409});m.execute.mockResolvedValue([[{...session,start_at:'2020-01-01 12:00:00'}]]);await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined'})).rejects.toMatchObject({status:410});});

it('requires a reason for mandatory attendees and presenters',async()=>{
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined'})).rejects.toMatchObject({status:400});
 m.execute.mockResolvedValue([[{...session,is_required:0,is_presenter:1}]]);
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',reason:'  '})).rejects.toMatchObject({status:400});
 expect(m.commit).not.toHaveBeenCalled();
});
it('allows optional attendees to RSVP attending without an explanation',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{...session,is_required:0}]]:[{affectedRows:1}]);
 await saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['SIGNED_UP',null,1,2]);
});
it.each(['forever','all_future'])('rejects indefinite RSVP scope %s',async scope=>{
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',scope,reason:'Conflict'})).rejects.toMatchObject({status:400});expect(m.commit).not.toHaveBeenCalled();
});
it('declines only the invited user’s recurring day through the inclusive local end date',async()=>{
 const group={...session,agency_id:2,session_type:'group',recurrence_series_id:'a',recurrence_frequency:'WEEKLY',start_at:'2026-10-20 23:00:00',event_timezone:'America/Denver'};
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT s.*,a.status'))return [[group]];
  if(sql.startsWith('SELECT s.* FROM'))return [[group,{...group,id:2,start_at:'2026-10-27 23:00:00'},{...group,id:3,start_at:'2026-10-28 23:00:00'},{...group,id:4,start_at:'2026-11-04 00:00:00'}]];
  return [{affectedRows:1}];
 });
 const result=await saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',scope:'until_date',untilDate:'2026-11-03',reason:'Class commitment',now:new Date('2026-10-19T00:00:00Z')});
 expect(result).toMatchObject({affectedSessions:3,untilDate:'2026-11-03'});
 expect(m.seriesEdit).toHaveBeenCalledOnce();
 const updates=m.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE supervision_session_attendees'));
 expect(updates.map(([,args])=>args.slice(1))).toEqual([[1,2],[2,2],[4,2]]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO supervision_rsvp_absences'),[2,'a',2,1,group.start_at,'2026-11-04 07:00:00','2026-11-03',2,'Class commitment']);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE supervision_sessions'))).toBe(false);
});
it.each([null,'','2026-02-30','2026-10-19'])('rejects missing, impossible, or earlier absence dates: %s',async untilDate=>{
 m.execute.mockResolvedValue([[{...session,session_type:'group',recurrence_series_id:'a',start_at:'2026-10-20 23:00:00'}]]);
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',reason:'Class',scope:'until_date',untilDate,now:new Date('2026-10-19T00:00:00Z')})).rejects.toMatchObject({status:400});
 expect(m.commit).not.toHaveBeenCalled();
});

it('lets optional invitees stop reminders without requiring or storing an absence reason',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{...session,is_required:0,session_type:'group'}]]:[{affectedRows:1}]);
 await saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',reason:'Unnecessary private detail'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['DECLINED',null,1,2]);
 expect(m.commit).toHaveBeenCalledOnce();
});

it('reads only the current attendee’s saved decline and reason', async () => {
 m.execute.mockResolvedValue([[{...session,attendee_status:'DECLINED',decline_reason:'Class conflict'}]]);
 await expect(getSupervisionRsvp({sessionId:1,userId:2})).resolves.toEqual({status:'DECLINED',reason:'Class conflict',required:true,canRespond:true,canAccept:true});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('a.user_id=?'),[2,1,2]);
 expect(m.execute.mock.calls[0][0]).toContain('ua.is_active=1 AND u.is_active=1');
 expect(m.execute.mock.calls[0][0]).toContain("a.status NOT IN ('REMOVED','CANCELLED','WITHDRAWN')");
 expect(m.commit).not.toHaveBeenCalled();
});
it('hides RSVP details without an active invitation and membership', async () => {
 m.execute.mockResolvedValue([[]]);await expect(getSupervisionRsvp({sessionId:1,userId:99})).rejects.toMatchObject({status:404});
});
it('respects closed signup and past sessions when loading an RSVP', async () => {
 m.execute.mockResolvedValue([[{...session,enrollment_mode:'signup_only',attendee_status:'DECLINED',signupOpen:false}]]);
 await expect(getSupervisionRsvp({sessionId:1,userId:2})).resolves.toMatchObject({canRespond:true,canAccept:false});
 m.execute.mockResolvedValue([[{...session,start_at:'2020-01-01 12:00:00'}]]);
 await expect(getSupervisionRsvp({sessionId:1,userId:2})).resolves.toMatchObject({canRespond:false,canAccept:false});
});
it('allows a confirmed attendee to decline after signup closes without cancelling the session', async () => {
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{...session,enrollment_mode:'signup_only',attendee_status:'SIGNED_UP',signupOpen:false,is_required:0}]]:[{affectedRows:1}]);
 await saveSupervisionRsvp({sessionId:1,userId:2,response:'declined'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['DECLINED',null,1,2]);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE supervision_sessions'))).toBe(false);
});

it.each([0,1])('lets a still-invited attendee reverse a decline during regular group supervision (required=%s)',async isRequired => {
 const now=new Date('2026-10-27T23:15:00Z');
 const active={...session,session_type:'group',enrollment_mode:'invited',start_at:'2026-10-27 23:00:00',end_at:'2026-10-28 00:00:00',attendee_status:'DECLINED',is_required:isRequired,decline_reason:'Schedule conflict'};
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[active]]:[{affectedRows:1}]);
 await expect(getSupervisionRsvp({sessionId:1,userId:2,now})).resolves.toMatchObject({canRespond:true,canAccept:true,required:!!isRequired});
 await saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted',now});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['SIGNED_UP',null,1,2]);
 const writes=m.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE'));
 expect(writes).toHaveLength(1);expect(writes[0][0]).not.toMatch(/is_required|is_compensable|attendance_rollup/);
});
it.each([
 {status:'CANCELLED'}, {status:'FINALIZED'}, {status:'MISSED'}, {status:'COMPLETED'},
 {live_ended_at:'2026-10-27 23:10:00'}, {calendar_deleted_at:'2026-10-27 23:10:00'},
 {end_at:'2026-10-27 23:10:00'}, {enrollment_mode:'signup_only'}, {session_type:'individual'}
])('keeps RSVP recovery closed for unavailable sessions: %j',async patch=>{
 const now=new Date('2026-10-27T23:15:00Z');
 m.execute.mockResolvedValue([[{...session,session_type:'group',start_at:'2026-10-27 23:00:00',end_at:'2026-10-28 00:00:00',attendee_status:'DECLINED',...patch}]]);
 await expect(getSupervisionRsvp({sessionId:1,userId:2,now})).resolves.toMatchObject({canRespond:false,canAccept:false});
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted',now})).rejects.toMatchObject({status:410});
 expect(m.commit).not.toHaveBeenCalled();
});
it('allows a decline to be reversed while the host keeps a regular group session in progress',async()=>{
 m.execute.mockResolvedValue([[{...session,session_type:'group',status:'IN_PROGRESS',start_at:'2026-10-27 23:00:00',end_at:'2026-10-28 00:00:00',attendee_status:'DECLINED'}]]);
 await expect(getSupervisionRsvp({sessionId:1,userId:2,now:new Date('2026-10-28T00:05:00Z')})).resolves.toMatchObject({canRespond:true,canAccept:true});
});
