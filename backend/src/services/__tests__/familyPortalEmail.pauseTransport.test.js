import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),gmail:vi.fn(),workspace:vi.fn(),log:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>{}}));
vi.mock('../unifiedEmail/gmailClient.js',()=>({getGmailClient:m.gmail,getImpersonatedUser:()=> 'sender@example.test'}));
vi.mock('../googleWorkspaceEmail.service.js',()=>({default:{sendEmail:m.workspace}}));
vi.mock('../emailSettings.service.js',()=>({getEmailSendingMode:async()=> 'all',isEmailNotificationsEnabled:async()=>true,emailRequiresAdminApproval:async()=>false}));
vi.mock('../managedWorkspaceGroupAccess.service.js',()=>({managedGroupEnvelope:async()=>({})}));
vi.mock('../priorityEventEmail.service.js',()=>({priorityEventEmailRecipient:async x=>x,savePriorityEventInboxCopy:vi.fn(),PRIORITY_EVENT_EMAILS:new Set()}));
vi.mock('../automationEmailOpsNotify.service.js',()=>({notifyTestingInboxOfHeldEmail:async()=>{}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findById:async()=>({id:1,agency_id:2})}}));
vi.mock('../../models/UserCommunication.model.js',()=>({default:{create:m.log}}));
vi.mock('../communicationLogging.service.js',()=>({default:{logGeneratedCommunication:m.log}}));
vi.mock('../../utils/hogwartsTestEmail.js',()=>({shouldRedirectHogwartsOutboundEmail:async()=>false,shouldRedirectForDemoAttachment:async()=>false,buildTestInboxRedirectMetadata:()=>({}),rewriteHogwartsOutboundRecipient:async x=>x}));
import EmailService from '../email.service.js';
import {sendEmailFromIdentity,sendNotificationEmail} from '../unifiedEmail/unifiedEmailSender.service.js';
beforeEach(()=>{
 vi.clearAllMocks();m.log.mockResolvedValue({id:100});
 m.execute.mockImplementation(async(sql)=>{
  if(sql.includes('agency_parent_email_controls'))return [[{routine_emails_paused:1}]];
  if(sql.includes('FROM users'))return [[{id:50,email:'parent@example.test',role:'client_guardian'}]];
  if(sql.includes('user_communications')&&sql.startsWith('SELECT'))return [[{metadata:{source:'auto'}}]];
  return [{affectedRows:1}];
 });
});
it.each([['fallback',x=>EmailService.sendEmail(x)],['identity',sendEmailFromIdentity],['notification',sendNotificationEmail]])('blocks the actual %s send path before Gmail and records suppression',async(_name,send)=>{
 const result=await send({agencyId:2,senderIdentityId:1,to:'parent@example.test',userId:50,templateType:'family_balance_due',subject:'Balance reminder',text:'Open your portal.'});
 expect(result).toMatchObject({skipped:true,reason:'routine_parent_emails_paused'});
 expect(m.gmail).not.toHaveBeenCalled();expect(m.workspace).not.toHaveBeenCalled();expect(m.log).toHaveBeenCalled();
});
it('does not let manual approval release a queued automatic reminder',async()=>{
 const result=await sendEmailFromIdentity({senderIdentityId:1,to:'parent@example.test',userId:50,source:'manual',existingCommunicationId:123,templateType:'family_balance_due'});
 expect(result.reason).toBe('routine_parent_emails_paused');expect(m.gmail).not.toHaveBeenCalled();
 expect(m.execute.mock.calls.some(([sql,args])=>sql.startsWith('UPDATE user_communications')&&args[1]===123)).toBe(true);
});
it.each([['fallback',x=>EmailService.sendEmail(x)],['identity',sendEmailFromIdentity],['notification',sendNotificationEmail]])('respects category opt-outs in the actual %s transport after the agency pause is lifted',async(_name,send)=>{
 const prior=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>{
  if(sql.includes('agency_parent_email_controls'))return Promise.resolve([[{routine_emails_paused:0}]]);
  if(sql.includes('FROM family_notification_choices'))return Promise.resolve([[{choices_json:{billing:'off'}}]]);
  return prior(sql,args);
 });
 const result=await send({agencyId:2,senderIdentityId:1,to:'parent@example.test',userId:50,source:'manual',templateType:'family_balance_due',subject:'Balance reminder',text:'Open your portal.'});
 expect(result).toMatchObject({skipped:true,reason:'family_notification_category_off'});
 expect(m.gmail).not.toHaveBeenCalled();expect(m.workspace).not.toHaveBeenCalled();
});
