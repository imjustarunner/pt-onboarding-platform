import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({queue:vi.fn(),execute:vi.fn(),link:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../hiringNotification.service.js',()=>({queueHiringNotification:m.queue}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantInterviewJoinUrl:m.link}));
import {queueInterviewHiringText,queueFutureHiringInterviews,queueReferenceHiringText,interviewNotificationDetails} from '../hiringJourneyEvents.service.js';
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[{consent_request_id:77}]]);m.link.mockResolvedValue('https://plotlinepo.com/interview/itsco/video/private-candidate-link');});
it('uses one durable scheduling key per appointment start and signed enrollment, including resends',async()=>{
 const input={agencyId:2,userId:8,interviewId:19,startsAt:'2026-12-01T15:00:00Z'};
 await queueInterviewHiringText(input);await queueInterviewHiringText(input);
 const event=m.queue.mock.calls[0][0];expect(m.queue.mock.calls[1][0]).toEqual(event);
 expect(event).toMatchObject({agencyId:2,userId:8,type:'interview_scheduled',emailAlreadyHandled:true});
 await queueInterviewHiringText({...input,startsAt:'2026-12-02T15:00:00Z'});
 expect(m.queue.mock.calls[2][0].key).not.toEqual(event.key);
 m.execute.mockResolvedValue([[{consent_request_id:78}]]);await queueInterviewHiringText(input);
 expect(m.queue.mock.calls[3][0].key).not.toEqual(event.key);
});
it('enables defaults for future interviews after review while preserving explicit reminder opt-outs',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT h.id')?[[{id:19,provider_schedule_event_id:9,interview_starts_at:'2026-12-01 15:00:00'}]]:sql.startsWith('SELECT consent_request_id')?[[{consent_request_id:77}]]:[{affectedRows:1}]);
 await queueFutureHiringInterviews(2,8);
 const update=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE provider_schedule_events'));
 expect(update[0]).toContain("JSON_EXTRACT(meeting_settings_json,'$.interviewSmsReminders') IS NULL");
 expect(update[1]).toEqual([9,2]);expect(m.queue).toHaveBeenCalledOnce();
});
it('keys actual reference activity without names, addresses, ratings, or answers in the SMS outbox',async()=>{
 await queueReferenceHiringText({agencyId:2,userId:8,requestIds:[9,10]});
 await queueReferenceHiringText({agencyId:2,userId:8,requestIds:[10,9]});
 expect(m.queue.mock.calls[0][0]).toEqual(m.queue.mock.calls[1][0]);
 await queueReferenceHiringText({agencyId:2,userId:8,referenceIndex:1,completed:true});
 expect(m.queue.mock.calls[2][0]).toMatchObject({type:'reference_completed',emailAlreadyHandled:true});
 expect(Object.keys(m.queue.mock.calls[2][0]).sort()).toEqual(['agencyId','emailAlreadyHandled','key','type','userId']);
});
it('resolves only the current persisted future appointment and tenant candidate link',async()=>{
 m.execute.mockResolvedValue([[{id:19,guest_join_token:'candidate-token',start_at:'2026-12-01 15:00:00',event_timezone:'America/Denver'}]]);
 const event={event_key:'interview_scheduled:19:2026-12-01T15:00:00.000Z:consent-77',agency_id:2,user_id:8};
 const details=await interviewNotificationDetails(event);
 expect(details.text).toContain('Dec 1, 2026');expect(details.text).toContain('private-candidate-link');
 expect(m.execute.mock.calls[0][1]).toEqual([19,2,8,'2026-12-01 15:00:00']);
 expect(m.execute.mock.calls[0][0]).toContain("e.status='ACTIVE'");
 m.execute.mockResolvedValue([[]]);expect(await interviewNotificationDetails(event)).toBeNull();
 expect(await interviewNotificationDetails({...event,event_key:'invalid'})).toBeNull();
});
