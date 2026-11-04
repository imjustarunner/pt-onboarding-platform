import { beforeEach, describe, expect, it, vi } from 'vitest';
import {createHash} from 'node:crypto';
const m=vi.hoisted(()=>({execute:vi.fn(),identity:vi.fn(),allowed:vi.fn(),gmail:vi.fn(),approval:vi.fn(),senderCurrent:true}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findById:m.identity}}));
vi.mock('../managedWorkspaceGroupAccess.service.js',()=>({managedGroupEnvelope:async input=>input}));
vi.mock('../dayCancellationEmail.service.js',()=>({reviewedDayCancellationContext:async()=>null}));
vi.mock('../appointmentCancellationEmail.service.js',()=>({individualCancellationEmailContext:async()=>null}));
vi.mock('../schoolFamilyStatusEmail.service.js',()=>({schoolFamilyStatusEmailContext:async()=>null}));
vi.mock('../clientExchangeDemo.service.js',()=>({blockDemoExchangeEmail:async()=>false}));
vi.mock('../messageReminderRecipient.service.js',()=>({assertMessageReminderRecipient:async()=>{}}));
vi.mock('../enrollmentReminderDelivery.service.js',()=>({enrollmentReminderDeliveryGate:async()=>({allowed:true})}));
vi.mock('../schoolSessionEmailPreferences.service.js',()=>({schoolSessionEmailDeliveryGate:async()=>({allowed:true})}));
vi.mock('../providerUpdateReminderGuard.service.js',()=>({assertProviderUpdateReminderDelivery:async()=>{}}));
vi.mock('../priorityEventEmail.service.js',()=>({priorityEventEmailRecipient:async input=>input,PRIORITY_EVENT_EMAILS:new Set(),savePriorityEventInboxCopy:vi.fn()}));
vi.mock('../emailSettings.service.js',()=>({getEmailSendingMode:async()=> 'all',isEmailNotificationsEnabled:m.allowed,emailRequiresAdminApproval:m.approval}));
vi.mock('../unifiedEmail/gmailClient.js',()=>({getGmailClient:m.gmail,getImpersonatedUser:()=> 'transport@tenant.test'}));
vi.mock('../routineParentEmailPause.service.js',()=>({routineParentEmailGate:async()=>({allowed:true})}));
vi.mock('../requiredProviderWorkEmail.service.js',()=>({isRequiredProviderWorkEmail:async()=>false}));
vi.mock('../emailComplianceFooter.service.js',()=>({assertRecipientAllowsEmail:async()=>({allowed:true}),appendComplianceFooter:async input=>input}));
vi.mock('../schoolCommunicationContext.service.js',()=>({isSchoolCommunication:async()=>false}));
vi.mock('../misdirectedEmailReport.service.js',()=>({createMisdirectedEmailReportLink:async()=>null}));
vi.mock('../staffHtmlEmailSignature.service.js',()=>({usesDepartmentHtmlSignature:()=>true,appendDepartmentHtmlSignature:async input=>({...input,appended:true})}));
vi.mock('../outboundEmailQuality.service.js',()=>({validateOutboundEmailQuality:()=>({ok:true}),formatQualityFlags:()=>'',scanStoredCommunicationQuality:async()=>({ok:true})}));
vi.mock('../../utils/hogwartsTestEmail.js',()=>({rewriteHogwartsOutboundRecipient:async input=>input,buildTestInboxRedirectMetadata:()=>({}),extractEmailAddresses:input=>[input]}));
vi.mock('../automationEmailOpsNotify.service.js',()=>({notifyTestingInboxOfHeldEmail:async()=>{}}));
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
const template='people_operations_submission';
const reference={kind:'prehire_complete',id:31,submittedAt:'2026-11-04T15:00:00.000Z',authority:{type:'agency_hiring_journey',agencyId:2}};
const version=createHash('sha256').update(JSON.stringify(reference)).digest('hex');
const review={reviewedByUserId:3,reviewedAt:'2026-11-04T14:00:00.000Z',senderIdentityId:11};
let record,event,reviewer;
beforeEach(()=>{
 vi.clearAllMocks();m.approval.mockResolvedValue(false);m.senderCurrent=true;m.allowed.mockResolvedValue(false);
 m.identity.mockImplementation(async id=>({id:Number(id),agency_id:2,is_active:1,identity_key:'people_operations',from_email:'peopleoperations@tenant.test'}));
 record={id:100,agency_id:2,user_id:7,generated_by_user_id:31,channel:'email',template_type:template,recipient_address:'reviewer@tenant.test',metadata:{peopleOperationsSubmissionId:8}};
 event={id:8,agency_id:2,candidate_user_id:31,recipient_user_id:7,communication_id:100,source_json:{...reference,version}};
 reviewer={id:7,work_email:'reviewer@tenant.test',email:'login@tenant.test',enabled:1};
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT * FROM user_communications'))return [[record]];
  if(sql.startsWith('SELECT * FROM people_operations_submission_notifications'))return [[event]];
  if(sql.startsWith('SELECT id,name,slug'))return [[{id:2,is_active:1,is_archived:0,feature_flags:{peopleOperationsSubmissionNotificationsEnabled:true,peopleOperationsSubmissionReview:review}}]];
  if(sql.startsWith('SELECT u.id,u.first_name'))return [[{id:31,first_name:'Candidate',last_name:'Example'}]];
  if(sql.includes('FROM hire_journeys'))return [[{submitted_at:new Date(reference.submittedAt)}]];
  if(sql.startsWith('SELECT DISTINCT u.id'))return [[reviewer]];
  if(sql.startsWith('SELECT id FROM email_sender_identities'))return [m.senderCurrent?[{id:11}]:[]];
  return [{affectedRows:1}];
 });
});
const input=()=>({senderIdentityId:11,agencyId:2,userId:7,generatedByUserId:31,to:'reviewer@tenant.test',existingCommunicationId:100,templateType:template,subject:'Submission ready',text:'Open the hiring workspace.',source:'auto'});
describe('People Operations proof at the actual unified sender boundary',()=>{
 it.each(['auto','manual'])('admits the resolved reviewed sender for %s delivery while the ordinary delivery switch stays off',async source=>{
  const result=await sendEmailFromIdentity({...input(),source});
  expect(result).toMatchObject({skipped:true,reason:'notifications_disabled',communicationId:100});
  expect(m.allowed).toHaveBeenCalledWith({agencyId:2,source});expect(m.gmail).not.toHaveBeenCalled();
 });
 it('retains initial reviewed submission mail in the ordinary approval queue when confirmation is required',async()=>{
  m.allowed.mockResolvedValue(true);m.approval.mockResolvedValue(true);
  const result=await sendEmailFromIdentity({...input(),preloggedReceipt:true});
  expect(result).toMatchObject({pendingApproval:true,queued:true,communicationId:100});
  expect(m.approval).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,templateType:template}));
  expect(m.gmail).not.toHaveBeenCalled();
 });
 it('rejects a different same-agency sender before any transport or general send gate',async()=>{
  await expect(sendEmailFromIdentity({...input(),senderIdentityId:99})).rejects.toMatchObject({status:403,code:'PEOPLE_OPERATIONS_SUBMISSION_REVIEW_REQUIRED'});
  expect(m.allowed).not.toHaveBeenCalled();expect(m.gmail).not.toHaveBeenCalled();
 });
 it('uses the model-resolved identity rather than trusting a requested numeric identity ID',async()=>{
  m.identity.mockResolvedValue({id:99,agency_id:2,is_active:1,from_email:'other@tenant.test'});
  await expect(sendEmailFromIdentity(input())).rejects.toMatchObject({status:403});expect(m.gmail).not.toHaveBeenCalled();
 });
 it('rejects a selected sender that is now inactive or outside the allowed tenant mailbox class',async()=>{
  m.senderCurrent=false;
  await expect(sendEmailFromIdentity({...input(),source:'manual'})).rejects.toMatchObject({status:403});
  const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT id FROM email_sender_identities'));
  expect(sql).toContain('agency_id=? AND is_active=1');expect(sql).toContain("'people_operations'");expect(args).toEqual([11,2]);
  expect(m.allowed).not.toHaveBeenCalled();expect(m.gmail).not.toHaveBeenCalled();
 });
 it.each(['reviewer@tenant.test,other@external.test','reviewer@tenant.test;other@external.test','Reviewer <reviewer@tenant.test>','reviewer@tenant.test\r\nBcc: other@external.test','reviewer@tenant.test\r\n','\nreviewer@tenant.test'])('denies a persisted malformed reviewer To at the real retry wrapper even when saved strings match: %s',async to=>{
  reviewer.work_email=to;record.recipient_address=to;
  await expect(sendEmailFromIdentity({...input(),to,source:'manual'})).rejects.toMatchObject({status:403});
  expect(m.allowed).not.toHaveBeenCalled();expect(m.gmail).not.toHaveBeenCalled();
 });
 it('rechecks a changed current official reviewer address on the manual retry path',async()=>{
  reviewer.work_email='changed@tenant.test';
  await expect(sendEmailFromIdentity({...input(),source:'manual'})).rejects.toMatchObject({status:403});expect(m.allowed).not.toHaveBeenCalled();expect(m.gmail).not.toHaveBeenCalled();
 });
});
