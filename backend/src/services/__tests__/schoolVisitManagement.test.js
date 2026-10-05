import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),patch:vi.fn(),remove:vi.fn(),event:vi.fn(),task:vi.fn(),notice:vi.fn(),taskStatus:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../googleCalendar.service.js',()=>({default:{isConfigured:()=>true,patchEventDetails:m.patch,deleteEvent:m.remove}}));
vi.mock('../schoolPortalEvents.service.js',()=>({updateSchoolPortalEvent:m.event}));
vi.mock('../../models/Task.model.js',()=>({default:{create:m.task,updateStatus:m.taskStatus}}));
vi.mock('../../models/Notification.model.js',()=>({default:{coalesceOrCreate:m.notice}}));
import { requestSchoolVisitChange as request, manageSchoolVisit as manage } from '../schoolVisitManagement.service.js';
describe('school visit management',()=>{
 let booking,allowed,conflict,pending;
 const user={id:9,role:'support'};
 beforeEach(()=>{
  vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  allowed=true;conflict=false;pending=null;
  booking={id:4,agency_id:2,school_agency_id:3,school_name:'Test School',cycle_id:6,slot_id:5,company_event_id:7,visit_revision:1,status:'booked',modality:'in_person',location_text:'School',location_mode:'school',starts_at:'2026-10-12 15:00:00',ends_at:'2026-10-12 15:30:00'};
  m.getConnection.mockResolvedValue({execute:m.execute,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:m.release});
  m.execute.mockImplementation(async(sql,args=[])=>{
   if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
   if(sql.includes('RELEASE_LOCK'))return [[]];
   if(sql.startsWith('SELECT b.*, a.name'))return [[booking]];
   if(sql.includes('FROM user_agencies'))return [allowed?[{allowed:1}]:[]];
   if(sql.startsWith('SELECT host_user_id'))return [[{host_user_id:9}]];
   if(sql.startsWith('SELECT h.*'))return [[{id:1,host_user_id:9,provider_schedule_event_id:11,email:'rachel@itsco.health',google_event_id:'event-1'}]];
   if(sql.startsWith('SELECT id FROM provider_schedule_events'))return [conflict?[{id:99}]:[]];
   if(sql.startsWith('SELECT id FROM school_reinit_change_requests'))return [pending?[{id:pending}]:[]];
   if(sql.startsWith('SELECT id FROM tasks'))return [[]];
   if(sql.startsWith('INSERT INTO school_reinit_change_requests')){pending=10;return [{insertId:10}];}
   if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))return [{affectedRows:1}];
   throw new Error('Unexpected query: '+sql);
  });
  m.patch.mockResolvedValue({ok:true,meetLink:'https://meet.google.com/test'});m.remove.mockResolvedValue({ok:true});m.task.mockResolvedValue({id:12});
 });
 it('creates a request and host task without changing the appointment',async()=>{
  const result=await request(4,{revision:1,name:'School staff',email:'staff@example.com',kind:'virtual',note:'Please meet virtually.'});
  expect(result.requestId).toBe(10);expect(m.patch).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
  expect(m.task).toHaveBeenCalledWith(expect.objectContaining({assignedToUserId:9,sourceRefType:'school_visit_request'}));
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE school_reinit_checkin_bookings'))).toBe(false);
 });
 it('rejects a stale link submission after the visit changes',async()=>{
  await expect(request(4,{revision:0,name:'Staff',email:'staff@example.com',kind:'cancel',note:'Cancel please'})).rejects.toMatchObject({status:409});
  expect(m.task).not.toHaveBeenCalled();
 });
 it('rejects management outside the agency',async()=>{
  allowed=false;await expect(manage(4,{action:'cancel',revision:1},user)).rejects.toMatchObject({status:403});expect(m.remove).not.toHaveBeenCalled();
 });
 it('updates virtual format across app and Google while preserving invitations',async()=>{
  const result=await manage(4,{action:'update',revision:1,modality:'virtual',startsAt:'2026-10-12T13:00',endsAt:'2026-10-12T13:30'},user);
  expect(result.synced).toBe(true);expect(m.patch).toHaveBeenCalledWith(expect.objectContaining({location:'',createMeetLink:true,startAt:'2026-10-12T19:00:00.000Z'}));
  expect(m.patch.mock.calls[0][0]).not.toHaveProperty('attendeeEmails');expect(m.event).toHaveBeenCalledWith(expect.objectContaining({schoolEventStatus:'rescheduled'}));expect(m.commit).toHaveBeenCalledOnce();
 });
 it('uses one shared virtual link for additional host copies',async()=>{
  const original=m.execute.getMockImplementation();
  m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT h.*') ? [[
   {id:2,host_user_id:10,provider_schedule_event_id:12,email:'other@itsco.health',google_event_id:'other-event'},
   {id:1,host_user_id:9,provider_schedule_event_id:11,email:'rachel@itsco.health',google_event_id:'event-1'}
  ]] : original(sql,args));
  await manage(4,{action:'update',revision:1,modality:'virtual',startsAt:'2026-10-12T13:00',endsAt:'2026-10-12T13:30'},user);
  expect(m.patch.mock.calls[0][0]).toMatchObject({subjectEmail:'rachel@itsco.health',createMeetLink:true});
  expect(m.patch.mock.calls[1][0]).toMatchObject({subjectEmail:'other@itsco.health',createMeetLink:false});
  expect(m.patch.mock.calls[1][0].description).toContain('https://meet.google.com/test');
 });
 it('cancels calendar invitations and the school event',async()=>{
  const result=await manage(4,{action:'cancel',revision:1},user);expect(result.synced).toBe(true);expect(m.remove).toHaveBeenCalledWith({subjectEmail:'rachel@itsco.health',eventId:'event-1'});expect(m.event).toHaveBeenCalledWith(expect.objectContaining({schoolEventStatus:'canceled'}));
 });
 it('keeps the saved change visible and pauses reminders when sync fails',async()=>{
  m.remove.mockResolvedValue({ok:false,reason:'google_api_error'});
  const result=await manage(4,{action:'cancel',revision:1},user);expect(result.saved).toBe(true);expect(result.synced).toBe(false);
  expect(m.execute.mock.calls.some(([sql])=>sql.includes("calendar_sync_status='error'"))).toBe(true);
 });
 it('rejects an overlapping host appointment without mutating the booking',async()=>{
  conflict=true;await expect(manage(4,{action:'update',revision:1,modality:'virtual',startsAt:'2026-10-12T13:00',endsAt:'2026-10-12T13:30'},user)).rejects.toMatchObject({status:409});expect(m.begin).not.toHaveBeenCalled();expect(m.patch).not.toHaveBeenCalled();
 });
});
