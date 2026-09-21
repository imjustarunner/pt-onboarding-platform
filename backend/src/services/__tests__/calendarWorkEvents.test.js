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
