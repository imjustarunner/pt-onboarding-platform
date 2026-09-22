import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),release:vi.fn(),get:vi.fn(),insert:vi.fn(),patch:vi.fn(),client:vi.fn(),user:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:m.execute,release:m.release})}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user}}));
vi.mock('../googleCalendar.service.js',()=>({default:{buildCalendarClientForSubject:m.client}}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async({user,guest})=>({email:guest?user.email:`staff${user.id}@tenant.org`,displayName:`Person ${user.id}`,calendarAccountEmail:guest?null:user.email})}));
import {syncHiringInterviewCalendar} from '../hiringInterviewCalendar.service.js';
const event={id:240,agency_id:2,provider_id:3,meeting_subtype:'interview',status:'ACTIVE',title:'Interview',start_at:'2026-09-22 18:30:00',end_at:'2026-09-22 19:30:00',event_timezone:'America/Denver'};
const interview={id:7,agency_id:2,provider_schedule_event_id:240,candidate_user_id:30,status:'scheduled',calendar_sender_email:'po@tenant.org',public_join_url:'https://tenant.org/join/team-meeting/guest'};
beforeEach(()=>{vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('FROM provider_schedule_events')?[[event]]:sql.includes('SELECT user_id')?[[{user_id:22}]]:[[]]);m.user.mockImplementation(async id=>({id,email:`user${id}@primary.org`}));m.client.mockReturnValue({events:{get:m.get,insert:m.insert,patch:m.patch}});m.get.mockRejectedValue({code:404});m.insert.mockResolvedValue({data:{id:'hiring2e240',htmlLink:'https://calendar.google.com/event'}});m.patch.mockResolvedValue({data:{id:'hiring2e240'}});});
describe('interview calendar repair',()=>{
 it('creates one named invitation on a real host calendar, not the PO email alias',async()=>{
  const result=await syncHiringInterviewCalendar(interview);expect(result.ok).toBe(true);expect(m.client).toHaveBeenCalledWith('user3@primary.org');
  const args=m.insert.mock.calls[0][0];expect(args.sendUpdates).toBe('all');expect(args.requestBody.id).toBe('hiring2e240');expect(args.requestBody.start.dateTime).toBe('2026-09-22T18:30:00.000Z');
  expect(args.requestBody.attendees).toEqual([{email:'staff3@tenant.org',displayName:'Person 3'},{email:'staff22@tenant.org',displayName:'Person 22'},{email:'user30@primary.org',displayName:'Person 30'}]);
  expect(args.requestBody.description).not.toContain('host-token');expect(m.execute.mock.calls.some(([sql])=>sql.includes('SET google_event_id'))).toBe(true);
 });
 it('finds the deterministic event after a lost database write and preserves RSVP on retries',async()=>{
  m.get.mockResolvedValue({data:{id:'hiring2e240',attendees:[{email:'user22@primary.org',responseStatus:'accepted'}]}});
  await syncHiringInterviewCalendar(interview);expect(m.insert).not.toHaveBeenCalled();expect(m.patch.mock.calls[0][0].requestBody.attendees[1].responseStatus).toBe('accepted');
 });
 it('does not replace inaccessible or cancelled events',async()=>{
  m.get.mockRejectedValue({code:403,message:'Forbidden'});expect((await syncHiringInterviewCalendar(interview)).ok).toBe(false);expect(m.insert).not.toHaveBeenCalled();
  m.get.mockResolvedValue({data:{status:'cancelled'}});expect((await syncHiringInterviewCalendar(interview)).ok).toBe(false);expect(m.patch).not.toHaveBeenCalled();
 });
});
