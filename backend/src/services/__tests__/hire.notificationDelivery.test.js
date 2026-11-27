import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({getConnection:vi.fn(),email:vi.fn(),sms:vi.fn(),sender:vi.fn(),details:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:mocks.getConnection}}));
vi.mock('../hirePortalWorkflow.service.js',()=>({portalPacket:vi.fn()}));
vi.mock('../hireJourney.service.js',()=>({taskPhase:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:mocks.email}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:mocks.sms}}));
vi.mock('../plotlineHiringSms.service.js',()=>({resolveHiringTextSender:mocks.sender,isPlotlineHiringSender:sender=>sender?.registration?.platformHiringSender===true}));
vi.mock('../hiringJourneyEvents.service.js',()=>({interviewNotificationDetails:mocks.details}));
import {runHiringNotifications} from '../hiringNotification.service.js';
let event,db;
beforeEach(()=>{
 vi.clearAllMocks();
 event={status:'ONBOARDING',id:9,user_id:8,agency_id:2,event_type:'document_added',email_status:'pending',sms_status:'pending',channel:'email',phone:'+17195550123',personal_email:'example@example.org',name:'Test organization',slug:'test',passwordless_token:'private-token',passwordless_token_purpose:'prehire_portal',passwordless_token_expires_at:'2099-01-01'};
 db={release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM hire_communication_preferences p JOIN users'))return [[]];
  if(sql.includes('FROM hire_notification_events e'))return [[event]];
  if(sql.includes('UPDATE hire_notification_events')){
   const channel=sql.includes('email_status')?'email_status':'sms_status';
   if(sql.includes("='sending'")){if(event[channel]!=='pending')return [{affectedRows:0}];event[channel]='sending';}
   else event[channel]=args[0];
   return [{affectedRows:1}];
  }
  return [[]];
 })};mocks.getConnection.mockResolvedValue(db);mocks.sender.mockResolvedValue({phone_number:'+17195550100',agency_id:2,registration:{brandName:'ITSCO'}});mocks.email.mockResolvedValue({id:'message-1'});mocks.sms.mockResolvedValue({});
});
describe('hiring notification dispatch',()=>{
 it('delivers email-only without touching the SMS transport',async()=>{await runHiringNotifications();expect(mocks.email).toHaveBeenCalledOnce();expect(mocks.sms).not.toHaveBeenCalled();expect(event.sms_status).toBe('skipped');});
 it('sends opted-in notices independently if email fails, binding the text to the candidate',async()=>{
  event.channel='email_sms';mocks.email.mockRejectedValue(new Error('Email unavailable'));
  await runHiringNotifications();expect(event.email_status).toBe('failed');expect(event.sms_status).toBe('sent');
  expect(mocks.sms).toHaveBeenCalledWith(expect.objectContaining({hiringUserId:8,agencyId:2,staffNotificationKind:'hiring',purpose:'workforce',body:expect.stringContaining('/pre-hire/private-token')}));
 });
 it('keeps email delivery successful when STOP or missing consent blocks SMS',async()=>{
  event.channel='email_sms';mocks.sms.mockRejectedValue(Object.assign(new Error('Blocked'),{code:'sms_opted_out'}));
  await runHiringNotifications();expect(event.email_status).toBe('sent');expect(event.sms_status).toBe('failed');
 });
 it('does not resend the same event on another worker tick',async()=>{event.channel='email_sms';await runHiringNotifications();await runHiringNotifications();expect(mocks.email).toHaveBeenCalledOnce();expect(mocks.sms).toHaveBeenCalledOnce();});
 it('never sends an expired or password-reset token as a portal link',async()=>{event.passwordless_token_purpose='reset';await runHiringNotifications();expect(mocks.email.mock.calls[0][0].text).not.toContain('private-token');});
 it('retains approval-held email accurately instead of marking it sent',async()=>{mocks.email.mockResolvedValue({queued:true,pendingApproval:true});await runHiringNotifications();expect(event.email_status).toBe('held');});
});

it('holds broad-program texts until the enrollment confirmation succeeds while email continues',async()=>{
 event.channel='email_sms';mocks.sender.mockResolvedValue({agency_id:null,phone_number:'+12025550100',registration:{platformHiringSender:true}});
 event.hiring_activation={workforce:{activated:true,confirmed:false}};
 await runHiringNotifications();expect(event.email_status).toBe('sent');expect(event.sms_status).toBe('pending');expect(mocks.sms).not.toHaveBeenCalled();
 event.hiring_activation.workforce.confirmed=true;await runHiringNotifications();expect(event.sms_status).toBe('sent');expect(mocks.email).toHaveBeenCalledOnce();
});
it('sends a current interview invitation through the candidate link and skips stale scheduling events',async()=>{
 event.channel='email_sms';event.event_type='interview_scheduled';event.email_status='sent';event.hiring_activation={workforce:{activated:true,confirmed:true}};
 mocks.sender.mockResolvedValue({agency_id:null,phone_number:'+12025550100',registration:{platformHiringSender:true}});
 mocks.details.mockResolvedValue({text:'Interview Dec 1. Join: https://plotlinepo.com/interview/itsco/video/candidate',interviewId:19,startAt:'2026-12-01 15:00:00'});
 await runHiringNotifications();expect(mocks.sms).toHaveBeenCalledWith(expect.objectContaining({agencyId:null,hiringAgencyId:2,interviewId:19,interviewSmsStartAt:'2026-12-01 15:00:00'}));
 event.sms_status='pending';mocks.sms.mockClear();mocks.details.mockResolvedValue(null);await runHiringNotifications();expect(event.sms_status).toBe('skipped');expect(mocks.sms).not.toHaveBeenCalled();
});
it('reference notices reveal progress only and do not reuse narrow legacy consent',async()=>{
 event.channel='email_sms';event.event_type='reference_completed';event.email_status='sent';
 await runHiringNotifications();expect(event.sms_status).toBe('skipped');expect(mocks.sms).not.toHaveBeenCalled();
 event.sms_status='pending';event.hiring_activation={workforce:{activated:true,confirmed:true}};
 mocks.sender.mockResolvedValue({agency_id:null,phone_number:'+12025550100',registration:{platformHiringSender:true}});
 await runHiringNotifications();expect(mocks.sms.mock.calls[0][0].body).toBe('A reference for your application has been completed. Confidential answers are kept private.');
});
