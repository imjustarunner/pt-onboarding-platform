import {describe,it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),personal:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/UserWorkSchedule.model.js',()=>({default:{getForUser:async()=>({isActive:false})}}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:m.personal}));
import {workCalendarEvents} from '../calendarEvents.service.js';
const office={id:1,office_location_id:2,room_id:3,room_number:'204',name:'Windchime',street_address:'437 Windchime Place',start_at:new Date('2026-09-26T14:00Z'),end_at:new Date('2026-09-26T15:00Z'),events_stored_utc:1};
beforeEach(()=>{vi.clearAllMocks();m.personal.mockResolvedValue({url:'https://tenant.example/join/invitation/personal'});});
describe('work calendar source projection',()=>{
 it('includes room details and emits one mirror per exact reservation without modifying the source',async()=>{
  m.execute.mockImplementation(async sql=>sql.includes('FROM office_events')?[[office,{...office,id:2},{...office,id:3,room_id:4,room_number:'205'}]]:[[]]);
  const events=await workCalendarEvents(5,2,'2026-09-26','2026-09-27');
  expect(events).toHaveLength(2);expect(events[0]).toMatchObject({key:'work:2:office:1',title:'Office booking · Room 204',location:'Windchime · Room 204 · 437 Windchime Place'});
  expect(events[1].title).toContain('Room 205');expect(m.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 });
 it('uses the calendar owner’s personal invitation, never the host token',async()=>{
  const event={id:12,agency_id:2,provider_id:9,kind:'TEAM_MEETING',start_at:office.start_at,end_at:office.end_at,host_join_token:'SECRET'};
  m.execute.mockImplementation(async sql=>sql.includes('FROM provider_schedule_events')?[[event]]:[[]]);
  const events=await workCalendarEvents(5,2,'2026-09-26','2026-09-27');
  expect(m.personal).toHaveBeenCalledWith(event,5);expect(events[0].url).toContain('/join/invitation/personal');expect(JSON.stringify(events)).not.toContain('SECRET');
 });
});

it('omits join links for private and in-person meetings',async()=>{
  const event={id:12,agency_id:2,provider_id:9,kind:'TEAM_MEETING',start_at:office.start_at,end_at:office.end_at,platform_video_link:0};
  m.execute.mockImplementation(async sql=>sql.includes('FROM provider_schedule_events')?[[event,{...event,id:13,is_private:1,platform_video_link:1}]]:[[]]);
  const events=await workCalendarEvents(5,2,'2026-09-26','2026-09-27');
  expect(events.map(e=>e.url)).toEqual([null,null]);expect(events[1].title).toBe('Busy');expect(m.personal).not.toHaveBeenCalled();
});
it('includes co-facilitators and excludes removed or declined supervision attendees',async()=>{
  m.execute.mockResolvedValue([[]]);
  await workCalendarEvents(5,2,'2026-09-26','2026-09-27');
  const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.includes('FROM supervision_sessions'));
  expect(sql).toContain('s.co_facilitator_user_id=?');expect(sql).toContain("'DECLINED','REMOVED','CANCELLED','WITHDRAWN'");expect(args.slice(0,5)).toEqual([2,5,5,5,5]);
});

it('publishes session type and initials for appointments stored as personal calendar facets',async()=>{
 const event={id:14,agency_id:2,provider_id:5,kind:'PERSONAL_EVENT',client_id:3,client_initials:'A.B.',appointment_id:22,appointment_modality:'TELEHEALTH',start_at:office.start_at,end_at:office.end_at,title:'Full Name - confidential assessment',description:'Private note'};
 m.execute.mockImplementation(async sql=>sql.includes('FROM provider_schedule_events')?[[event]]:[[]]);
 const events=await workCalendarEvents(5,2,'2026-09-26','2026-09-27');
 expect(events[0].title).toBe('Telehealth session · A.B.');expect(JSON.stringify(events)).not.toMatch(/Full Name|confidential|Private note/);
});

it('SMS summaries omit initials, addresses, room names, contents and join links without creating invitations',async()=>{
 const event={id:14,agency_id:2,provider_id:5,kind:'TEAM_MEETING',client_id:3,client_initials:'A.B.',start_at:office.start_at,end_at:office.end_at,title:'SECRET',description:'SECRET',platform_video_link:1};
 m.execute.mockImplementation(async sql=>sql.includes('FROM provider_schedule_events')?[[event]]:sql.includes('FROM office_events')?[[{...office,client_id:3,client_initials:'C.D.'}]]:sql.includes('FROM supervision_sessions')?[[{...event,modality:'VIRTUAL'}]]:[[]]);
 const events=await workCalendarEvents(5,2,'2026-09-26','2026-09-27',{summaryOnly:true});
 expect(events.map(e=>e.title)).toEqual(['Team meeting','Session','Supervision']);
 expect(JSON.stringify(events)).not.toMatch(/A\.B\.|C\.D\.|SECRET|Windchime|204|https:/);expect(m.personal).not.toHaveBeenCalled();
 expect(m.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
