vi.mock('../scheduleCalendarPolicy.service.js',()=>({googleScheduleAllowedForEmail:vi.fn(async()=>true),GOOGLE_SCHEDULE_DISABLED:{skipped:true}}));
import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../googleMeetTranscript.service.js',()=>({ensureMeetAutoTranscriptionEnabled:vi.fn()}));
import GoogleCalendarService from '../googleCalendar.service.js';
const insert=vi.fn(),patch=vi.fn();
beforeEach(()=>{
  vi.restoreAllMocks();insert.mockReset().mockResolvedValue({data:{id:'event'}});patch.mockReset().mockResolvedValue({data:{id:'event'}});
  vi.spyOn(GoogleCalendarService,'isConfigured').mockReturnValue(true);
  vi.spyOn(GoogleCalendarService,'buildCalendarClientForSubject').mockReturnValue({events:{insert,patch}});
});
describe('app-owned meeting notifications',()=>{
  it('retries a stable recurring insert as a patch instead of creating duplicates',async()=>{
    insert.mockRejectedValueOnce({code:409});
    const result=await GoogleCalendarService.upsertProviderPrimaryCalendarEvent({subjectEmail:'host@example.com',stableInsertId:'reca1d0',summary:'Supervision',startAt:'2027-10-01 10:00:00',endAt:'2027-10-01 11:00:00',sendUpdates:'none',disableReminders:true});
    expect(result).toMatchObject({ok:true,googleEventId:'reca1d0'});
    expect(insert).toHaveBeenCalledOnce();expect(insert.mock.calls[0][0].requestBody.id).toBe('reca1d0');
    expect(patch.mock.calls[0][0]).toMatchObject({eventId:'reca1d0',sendUpdates:'none'});
  });
  it.each(['TEAM_MEETING','HUDDLE'])('never sends a Google guest invitation for %s',async kind=>{
    await GoogleCalendarService.createProviderScheduleEvent({subjectEmail:'host@example.com',startAt:'2026-09-28T16:00:00',endAt:'2026-09-28T17:00:00',summary:'Leadership',kind,attendeeEmails:['invitee@example.com'],sendUpdates:'all'});
    expect(insert).toHaveBeenCalledOnce();
    const args=insert.mock.calls[0][0];expect(args.sendUpdates).toBe('none');expect(args.requestBody.attendees).toBeUndefined();expect(args.requestBody.reminders).toEqual({useDefault:false,overrides:[]});
  });
  it('includes named tenant guests when an interview explicitly requests calendar invitations',async()=>{
    await GoogleCalendarService.createProviderScheduleEvent({subjectEmail:'host@primary.com',startAt:'2026-09-28T16:00:00',endAt:'2026-09-28T17:00:00',summary:'Interview',kind:'TEAM_MEETING',inviteGoogleGuests:true,attendeeDetails:[{email:'haley@itsco.health',displayName:'Haley Inyart'},{email:'applicant@example.org',displayName:'Applicant Name'}],sendUpdates:'all'});
    expect(insert.mock.calls[0][0]).toMatchObject({sendUpdates:'all',requestBody:{attendees:[{email:'haley@itsco.health',displayName:'Haley Inyart'},{email:'applicant@example.org',displayName:'Applicant Name'}]}});
  });
  it('does not change unrelated personal calendar invitation behavior',async()=>{
    await GoogleCalendarService.createProviderScheduleEvent({subjectEmail:'host@example.com',startAt:'2026-09-28T16:00:00',endAt:'2026-09-28T17:00:00',summary:'Personal',kind:'PERSONAL_EVENT',attendeeEmails:['invitee@example.com']});
    expect(insert.mock.calls[0][0].sendUpdates).toBe('all');expect(insert.mock.calls[0][0].requestBody.attendees).toHaveLength(1);
  });
  it('retains app join links while updating a calendar copy silently',async()=>{
    await GoogleCalendarService.upsertProviderPrimaryCalendarEvent({subjectEmail:'host@example.com',existingGoogleEventId:'event',summary:'Leadership',description:'Join with app: https://tenant.example/join/team-meeting/p',startAt:'2026-09-28T16:00:00',endAt:'2026-09-28T17:00:00',sendUpdates:'none',disableReminders:true});
    expect(patch.mock.calls[0][0]).toMatchObject({sendUpdates:'none',requestBody:{description:expect.stringContaining('/join/team-meeting/'),reminders:{useDefault:false,overrides:[]}}});
  });
  it('supervision copies do not add Google guests or erase existing guest lists on patch',async()=>{
    await GoogleCalendarService.upsertSupervisionSession({supervisionSessionId:1,hostEmail:'host@example.com',attendeeEmail:'invitee@example.com',startAt:'2026-09-28 22:00:00',endAt:'2026-09-28 23:00:00',summary:'Supervision',appJoinUrl:'https://tenant.example/join/supervision/p',existingGoogleEventId:'event'});
    expect(patch.mock.calls[0][0].sendUpdates).toBe('none');expect(patch.mock.calls[0][0].requestBody.attendees).toBeUndefined();expect(patch.mock.calls[0][0].requestBody.description).toContain('/join/supervision/p');
  });
});
