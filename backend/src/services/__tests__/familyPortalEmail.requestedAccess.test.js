import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),opt:vi.fn(),footer:vi.fn(),approval:vi.fn(),log:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../unifiedEmail/gmailClient.js',()=>({getGmailClient:async()=>({users:{messages:{send:m.send,get:async()=>({data:{}})}}}),getImpersonatedUser:()=> 'sender@example.test'}));
vi.mock('../unifiedEmail/verifiedSender.js',()=>({assertVerifiedGmailSender:async()=>{}}));
vi.mock('../googleWorkspaceEmail.service.js',()=>({default:{sendEmail:m.send,isConfigured:()=>true}}));
vi.mock('../emailSettings.service.js',()=>({getEmailSendingMode:async()=> 'all',isEmailNotificationsEnabled:async()=>true,emailRequiresAdminApproval:m.approval}));
vi.mock('../emailComplianceFooter.service.js',()=>({assertRecipientAllowsEmail:m.opt,appendComplianceFooter:m.footer}));
vi.mock('../activityProtection.service.js',()=>({protectOutboundEmail:async()=>{}}));
vi.mock('../managedWorkspaceGroupAccess.service.js',()=>({managedGroupEnvelope:async x=>x}));
vi.mock('../priorityEventEmail.service.js',()=>({priorityEventEmailRecipient:async x=>x,savePriorityEventInboxCopy:vi.fn(),PRIORITY_EVENT_EMAILS:new Set()}));
vi.mock('../automationEmailOpsNotify.service.js',()=>({notifyTestingInboxOfHeldEmail:async()=>{}}));
vi.mock('../ssoEmailCopy.service.js',()=>({withSsoSenderCopy:async x=>x.bcc}));
vi.mock('../contactCommsLogging.service.js',()=>({logContactCommunicationIfApplicable:async()=>{}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findById:async()=>({id:1,agency_id:2,from_email:'contact@example.test',identity_key:'notifications',display_name:'Portal',is_active:1})}}));
vi.mock('../../models/UserCommunication.model.js',()=>({default:{create:m.log,generateTrackingToken:()=> 'tracking',setTrackingToken:async()=>{}}}));
vi.mock('../communicationLogging.service.js',()=>({default:{logGeneratedCommunication:m.log,markAsSent:async()=>{},markAsFailed:async()=>{}}}));
vi.mock('../../utils/hogwartsTestEmail.js',()=>({shouldRedirectHogwartsOutboundEmail:async()=>false,shouldRedirectForDemoAttachment:async()=>false,buildTestInboxRedirectMetadata:()=>({}),rewriteHogwartsOutboundRecipient:async x=>({...x,redirected:false})}));
vi.mock('../schoolCommunicationContext.service.js',()=>({isSchoolCommunication:async()=>false}));
vi.mock('../misdirectedEmailReport.service.js',()=>({createMisdirectedEmailReportLink:async()=>null}));
vi.mock('../staffHtmlEmailSignature.service.js',()=>({usesDepartmentHtmlSignature:()=>true,appendDepartmentHtmlSignature:async x=>({...x,appended:true})}));
vi.mock('../tenantEmailChrome.service.js',()=>({wrapOutboundHtmlWithTenantChrome:async x=>x.html}));
vi.mock('../outboundEmailQuality.service.js',()=>({validateOutboundEmailQuality:()=>({ok:true,flags:[]}),formatQualityFlags:()=>'',scanStoredCommunicationQuality:()=>({ok:true})}));
import EmailService from '../email.service.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {REQUESTED_ACCOUNT_EMAIL_TYPES} from '../../utils/accountAccessEmail.js';
const input={agencyId:2,senderIdentityId:1,userId:20,to:'parent@example.test',fromAddress:'contact@example.test',usedFallbackSender:false,text:'Open your requested account link.',html:'<p>Requested account link</p>',subject:'Your requested link'};
beforeEach(()=>{
 vi.clearAllMocks();m.log.mockResolvedValue({id:100});m.opt.mockResolvedValue({allowed:false,reason:'recipient_opted_out'});m.approval.mockResolvedValue(true);
 m.footer.mockImplementation(async x=>({text:x.text,html:x.html}));m.send.mockResolvedValue({id:'accepted',data:{id:'accepted'}});
 m.execute.mockImplementation(async sql=>sql.includes('agency_parent_email_controls')?[[{routine_emails_paused:0}]]:sql.startsWith('SELECT')?[[]]:[{affectedRows:1}]);
});
for(const [path,send] of [['identity',sendEmailFromIdentity],['fallback',x=>EmailService.sendEmail(x)]]) {
 it.each([...REQUESTED_ACCOUNT_EMAIL_TYPES])(`delivers requested %s via ${path} despite optional opt-out without waiting for approval`,async templateType=>{
  const result=await send({...input,templateType});expect(result.skipped).not.toBe(true);expect(result.queued).not.toBe(true);
  expect(m.send).toHaveBeenCalledTimes(1);expect(m.opt).not.toHaveBeenCalled();expect(m.approval).not.toHaveBeenCalled();expect(m.footer).toHaveBeenCalledWith(expect.objectContaining({skipOptOutLink:true}));
 });
 it(`keeps the optional-email opt-out gate in the ${path} transport`,async()=>{
  expect(await send({...input,templateType:'ordinary_update'})).toMatchObject({skipped:true,reason:'recipient_opted_out'});expect(m.send).not.toHaveBeenCalled();
 });
}
it('holds a newly reserved receipt for approval and saves its actual body and sender',async()=>{
 m.opt.mockResolvedValue({allowed:true});
 const result=await sendEmailFromIdentity({...input,templateType:'enrollment_submission_confirmation',existingCommunicationId:77,preloggedReceipt:true,intakeSubmissionId:10});
 expect(result).toMatchObject({queued:true,communicationId:77});expect(m.send).not.toHaveBeenCalled();expect(m.log).not.toHaveBeenCalled();
 const update=m.execute.mock.calls.find(([q])=>q.includes('JSON_MERGE_PATCH'));expect(update[1][0]).toBe(input.subject);expect(JSON.parse(update[1][2]).senderIdentityId).toBe(1);expect(update[1].slice(-2)).toEqual([77,2]);
});
