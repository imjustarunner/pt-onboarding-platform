import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),context:vi.fn(),email:vi.fn(),notice:vi.fn(),number:vi.fn(),sms:vi.fn(),log:vi.fn(),sent:vi.fn(),failed:vi.fn(),intake:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../schoolContactPlan.service.js',()=>({getContactPlanContext:m.context,sendSchoolContactEmail:m.email,SCHOOL_CONTACT_DEMO_AGENCY_ID:450,SCHOOL_CONTACT_TEST_INBOX:'testing@itsco.health',schoolContactRouting:provider=>({providerEmail:provider.email || 'provider@example.com'}),renderSchoolContactTemplate:vi.fn()}));
vi.mock('../schoolContactProviderNotice.service.js',()=>({sendSchoolContactProviderNotice:m.notice}));
vi.mock('../communicationRouting.service.js',()=>({resolveOutboundNumber:m.number}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:vi.fn()}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:m.sms}}));
vi.mock('../../models/MessageLog.model.js',()=>({default:{normalizePhone:p=>p?`+${String(p).replace(/\D/g,'').replace(/^(?=\d{10}$)/,'1')}`:null,createOutbound:m.log,markSent:m.sent,markFailed:m.failed}}));
vi.mock('../../models/Notification.model.js',()=>({default:{coalesceOrCreate:vi.fn()}}));
vi.mock('../../models/ClientNotes.model.js',()=>({default:{}}));
vi.mock('../../models/clinical/ClinicalNote.model.js',()=>({default:{hasSignedIntakeForClient:m.intake}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({resolveMessagesSendMailbox:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
import {processSchoolContactAutomation} from '../schoolContactAutomation.service.js';

const DAY=86400000,HOUR=3600000,start=new Date('2026-10-30T18:00:00Z'),decided='2026-10-01T12:00:00Z';
let state,steps,care;
const tick=async date=>{vi.setSystemTime(date);return processSchoolContactAutomation({now:new Date(date)});};
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(start);for(const mock of Object.values(m))mock.mockReset();
 steps=new Map();care={intake_completed:0,intake_scheduled:0};
 state={id:42,agency_id:450,client_id:2298,school_id:451,provider_user_id:1490,school_name:'Cedar Grove',service_day:'Tuesday',assignment_active:1,client_terminal:0,plan_decided_at:decided,current_plan_decided_at:decided,plan_status:'enabled',status:'waiting_parent',session_sms_opt_in:1,conversation_id:88,initial_sent_at:new Date(start.getTime()-2*DAY)};
 m.context.mockResolvedValue({agencyId:450,userId:1490,schools:[{id:451}],provider:{first_name:'Quality',last_name:'Tester'},agency:{name:'ITSCOLLC',feature_flags:{schoolContactPlanDemoSmsRecipients:{'client:2298':'+16189107000'}}}});
 m.intake.mockResolvedValue(false);
 m.email.mockResolvedValue({sent:true,messageId:901,conversationId:88});m.notice.mockResolvedValue({sent:true,messageId:902});
 m.number.mockResolvedValue({number:{id:9,agency_id:450,phone_number:'+17196775413'},ownerType:'agency'});m.sms.mockResolvedValue({sid:'carrier-42'});m.log.mockResolvedValue({id:77});m.sent.mockResolvedValue();m.failed.mockResolvedValue();
 m.connection.mockResolvedValue({execute:vi.fn().mockResolvedValue([[{claimed:1}]]),release:vi.fn()});
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.startsWith('INSERT IGNORE INTO school_contact_workflows'))return [{affectedRows:0}];
  if(sql.includes('p.status AS plan_status'))return [[...(['cancelled','complete','needs_review'].includes(state.status)?[]:[{...state}])]];
  if(sql.startsWith('SELECT MAX(replied_at)')||sql.startsWith('SELECT MIN(e.occurred_at)'))return [[{replied_at:null}]];
  if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM client_intake_note_drafts'))return [[care]];
  if(sql.startsWith('SELECT p.status,p.decided_at'))return [[{status:state.plan_status,decided_at:decided}]];
  if(sql.startsWith('SELECT u.id,u.first_name'))return [[{id:1437,first_name:'Dana',last_name:'QA',email:'testing@itsco.health',phone:'+16189107000'}]];
  if(sql.startsWith('INSERT IGNORE INTO school_contact_workflow_steps')){if(steps.has(args[1]))return [{affectedRows:0}];steps.set(args[1],{status:'sending'});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM school_contact_workflow_steps'))return [[steps.get(args[1])]];
  if(sql.startsWith('UPDATE school_contact_workflow_steps SET status=?')){steps.set(args[7],{status:args[0],message_id:args[1],detail:args[2],completed_at:args[3],channel:args[4],conversation_id:args[5]});return [{affectedRows:1}];}
  if(sql.startsWith("UPDATE school_contact_workflow_steps SET status='needs_review'")){steps.set(args[2],{status:'needs_review',detail:args[0]});return [{affectedRows:1}];}
  if(sql.includes("SET status='needs_review'")){state.status='needs_review';return [{affectedRows:1}];}
  if(sql.includes("SET status='cancelled'")){state.status='cancelled';return [{affectedRows:1}];}
  if(sql.includes('SET second_contact_at=?')){state.second_contact_at=args[0];return [{affectedRows:1}];}
  if(sql.includes('SET final_contact_at=?')){state.final_contact_at=args[0];return [{affectedRows:1}];}
  if(sql.includes('SET intake_arranged_at=COALESCE')){state.intake_arranged_at||=args[0];return [{affectedRows:1}];}
  if(sql.includes('SET provider_notified_at=COALESCE')){state.provider_notified_at||=args[0];state.last_intake_reminder_at=args[1];state.status='intake_followup_required';return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE school_contact_workflows SET status=?')){state.status=args[0];return [{affectedRows:1}];}
  if(sql.startsWith('INSERT IGNORE INTO client_parent_contact_attempts'))return [{affectedRows:1}];
  throw new Error(`Unhandled worker query: ${sql}`);
 });
});
afterEach(()=>vi.useRealTimers());

describe('three-contact worker transport and durable receipts',()=>{
 it('uses the permitted family phone in the live ITSCO cohort without requiring a QA fixture',async()=>{
  state.agency_id=2;m.context.mockResolvedValue({agencyId:2,userId:1490,schools:[{id:451}],provider:{first_name:'Live',last_name:'Provider'},agency:{id:2,name:'ITSCO',feature_flags:{}}});
  m.number.mockResolvedValue({number:{id:9,agency_id:2,phone_number:'+17196775413'},ownerType:'agency'});
  await tick(start);
  expect(m.sms).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({purpose:'care',agencyId:2,to:'+16189107000'}));
  expect(m.email).not.toHaveBeenCalled();
 });
 it('sends second-contact SMS at exactly48hours, never also email, and sends final contact only by email48hours later',async()=>{
  await tick(new Date(start.getTime()-1));expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
  await tick(start);expect(m.sms).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({purpose:'care',agencyId:450,to:'+16189107000'}));expect(m.email).not.toHaveBeenCalled();expect(steps.get('second_contact').status).toBe('sent');
  await tick(new Date(start.getTime()+2*DAY-1));expect(m.email).not.toHaveBeenCalled();
  await tick(new Date(start.getTime()+2*DAY));expect(m.email).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({stepKey:'final_contact'}));expect(m.sms).toHaveBeenCalledTimes(1);
  await tick(new Date(start.getTime()+2*DAY+1));expect(m.email).toHaveBeenCalledTimes(1);expect(m.notice).not.toHaveBeenCalled();
 });
 it.each(['no_opt_in','no_client_bound_fixture','no_active_clinical_route','carrier_policy_skip'])('falls back to one second email when SMS is definitely unavailable: %s',async reason=>{
  if(reason==='no_opt_in')state.session_sms_opt_in=0;
  if(reason==='no_client_bound_fixture')m.context.mockResolvedValue({agencyId:450,userId:1490,schools:[{id:451}],provider:{first_name:'Quality'},agency:{name:'ITSCOLLC',feature_flags:{}}});
  if(reason==='no_active_clinical_route')m.number.mockResolvedValue({number:{id:2,agency_id:999,phone_number:'+17195550100'}});
  if(reason==='carrier_policy_skip')m.sms.mockRejectedValue(Object.assign(new Error('not sent'),{code:'sms_no_consent'}));
  await tick(start);await tick(new Date(start.getTime()+1));expect(m.email).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({stepKey:'second_contact'}));expect(steps.get('second_contact').status).toBe('sent');expect(state.second_contact_at).toEqual(start);
 });
 it.each([Object.assign(new Error('timeout'),{code:'ETIMEDOUT'}),null])('never sends a fallback email or retries after an ambiguous SMS delivery: %o',async error=>{
  if(error)m.sms.mockRejectedValue(error);else m.sms.mockResolvedValue({});
  await tick(start);expect(state.status).toBe('needs_review');expect(steps.get('second_contact').status).toBe('needs_review');expect(m.email).not.toHaveBeenCalled();expect(state.second_contact_at).toBeUndefined();
  await tick(new Date(start.getTime()+HOUR));expect(m.sms).toHaveBeenCalledTimes(1);expect(m.email).not.toHaveBeenCalled();
 });
 it('waits48hours after the actual final send before Day6 and reuses its provider-notice receipt after an aggregate-update interruption',async()=>{
  state.second_contact_at=new Date(start.getTime()-2*DAY);state.final_contact_at=start;
  await tick(new Date(start.getTime()+2*DAY-1));expect(m.notice).not.toHaveBeenCalled();
  await tick(new Date(start.getTime()+2*DAY));expect(m.notice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:42}),expect.anything(),{reminder:false,stepKey:'provider_notice'});
  state.provider_notified_at=null;state.last_intake_reminder_at=null;
  await tick(new Date(start.getTime()+2*DAY+1));expect(m.notice).toHaveBeenCalledTimes(1);expect(state.provider_notified_at).toEqual(new Date(start.getTime()+2*DAY));
 });
 it('repeats documentation notices at48hours until a finalized intake, while a scheduled intake or later reply does not count as completed',async()=>{
  state.provider_notified_at=start;state.provider_replied_at=start;care.intake_scheduled=1;
  await tick(new Date(start.getTime()+2*DAY-1));expect(m.notice).not.toHaveBeenCalled();
  await tick(new Date(start.getTime()+2*DAY));expect(m.notice).toHaveBeenCalledTimes(1);expect(m.notice.mock.calls[0][2].reminder).toBe(true);
  await tick(new Date(start.getTime()+4*DAY));expect(m.notice).toHaveBeenCalledTimes(2);
  care.intake_completed=1;await tick(new Date(start.getTime()+6*DAY));expect(state.status).toBe('complete');expect(m.notice).toHaveBeenCalledTimes(2);
 });
 it('stops documentation reminders when Note Workspace has a signed clinical intake even without a main imported intake',async()=>{
  state.provider_notified_at=start;care.intake_completed=0;m.intake.mockResolvedValue(true);
  await tick(new Date(start.getTime()+2*DAY));
  expect(m.intake).toHaveBeenCalledExactlyOnceWith({agencyId:450,clientId:2298});
  expect(state.status).toBe('complete');expect(m.notice).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
 });
 it('does not query clinical note bodies or require another database read for an already finalized main intake',async()=>{
  state.provider_notified_at=start;care.intake_completed=1;
  await tick(new Date(start.getTime()+2*DAY));expect(m.intake).not.toHaveBeenCalled();expect(state.status).toBe('complete');expect(m.notice).not.toHaveBeenCalled();
 });
 it('recognizes booked mental-health intake services and fails closed when finalized-intake verification is unavailable',async()=>{
  m.intake.mockRejectedValue(new Error('clinical status unavailable'));
  await expect(tick(start)).rejects.toThrow('clinical status unavailable');
  const query=m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT EXISTS(SELECT 1 FROM client_intake_note_drafts'))[0];
  expect(query).toContain("ap.business_type IN ('clinical','mental_health','healthcare')");expect(query).toContain("ap.service_code IN ('90791','H0031')");
  expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();expect(m.notice).not.toHaveBeenCalled();
 });
 it('cancels when another school remains assigned but the original workflow school no longer is',async()=>{
  m.context.mockResolvedValue({agencyId:450,userId:1490,schools:[{id:999}],provider:{first_name:'Quality'},agency:{name:'Demo'}});
  await tick(start);expect(state.status).toBe('cancelled');expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();expect(m.notice).not.toHaveBeenCalled();expect(m.intake).not.toHaveBeenCalled();
 });
 it('cancels an obsolete provider scope before a carrier or email send',async()=>{
  m.context.mockRejectedValue(Object.assign(new Error('access ended'),{status:403}));await tick(start);expect(state.status).toBe('cancelled');expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();expect(m.notice).not.toHaveBeenCalled();
 });
 it('stops guardian outreach once a reply or an intake meeting is recorded',async()=>{
  state.external_reply_recorded_at=start;await tick(start);expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
  state.external_reply_recorded_at=null;care.intake_scheduled=1;await tick(new Date(start.getTime()+DAY));expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
 });
 it('does not restart guardian outreach when an arranged intake later leaves the future-appointment window',async()=>{
  care.intake_scheduled=1;await tick(start);expect(state.intake_arranged_at).toEqual(start);expect(m.email).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();
  care.intake_scheduled=0;await tick(new Date(start.getTime()+10*DAY));expect(state.status).toBe('intake_arranged');expect(m.email).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();
 });
});
