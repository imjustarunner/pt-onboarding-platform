import crypto from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),workspace:vi.fn(),log:vi.fn(),sent:vi.fn(),failed:vi.fn(),approval:vi.fn(),identity:vi.fn(),redirect:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../googleWorkspaceEmail.service.js',()=>({default:{sendEmail:m.workspace,isConfigured:()=>true}}));
vi.mock('../emailSettings.service.js',()=>({getEmailSendingMode:async()=> 'all',isEmailNotificationsEnabled:async()=>true,emailRequiresAdminApproval:m.approval}));
vi.mock('../routineParentEmailPause.service.js',()=>({routineParentEmailGate:async()=>({allowed:true})}));
vi.mock('../emailComplianceFooter.service.js',()=>({assertRecipientAllowsEmail:async()=>({allowed:true}),appendComplianceFooter:async x=>({text:x.text,html:x.html})}));
vi.mock('../emailAliasFallbackTask.service.js',()=>({isForbiddenFallbackFrom:()=>false,createMissingAliasTaskAndBlock:vi.fn()}));
vi.mock('../schoolCommunicationContext.service.js',()=>({isSchoolCommunication:async()=>false}));
vi.mock('../outboundEmailQuality.service.js',()=>({validateOutboundEmailQuality:()=>({ok:true}),formatQualityFlags:()=>''}));
vi.mock('../automationEmailOpsNotify.service.js',()=>({notifyTestingInboxOfHeldEmail:async()=>{}}));
vi.mock('../communicationLogging.service.js',()=>({default:{logGeneratedCommunication:m.log,markAsSent:m.sent,markAsFailed:m.failed}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.identity}));
vi.mock('../../models/UserCommunication.model.js',()=>({default:{updateDeliveryStatus:vi.fn()}}));
vi.mock('../../utils/hogwartsTestEmail.js',()=>({shouldRedirectHogwartsOutboundEmail:async()=>false,shouldRedirectForDemoAttachment:async()=>false,
  buildTestInboxRedirectMetadata:()=>({testInboxRedirected:true}),rewriteHogwartsOutboundRecipient:m.redirect}));
import EmailService from '../email.service.js';
import { sendCommunicationRecord } from '../communicationRecordDelivery.service.js';

const scope='a'.repeat(64);
const input={to:'parent@example.test',cc:['provider@care.example'],subject:'School session notice',text:'Your dependent will be seen today at school.',
  html:'<p>Your dependent will be seen today at school.</p>',templateType:'school_session_notice',schoolSessionScopeKey:scope,
  fromAddress:'notifications@auricwell.com',fromName:'AuricWell Notifications',replyTo:'support@care.example',usedFallbackSender:false};
let saved,disabled;
beforeEach(()=>{
 vi.clearAllMocks();saved=null;disabled=false;
 m.approval.mockResolvedValue(false);m.workspace.mockResolvedValue({id:'smtp-accepted'});
 m.redirect.mockImplementation(async value=>({...value,redirected:false}));
 m.log.mockImplementation(async value=>{saved={id:77,agency_id:value.agencyId,user_id:value.userId,client_id:value.clientId,
   recipient_address:value.recipientAddress,template_type:value.templateType,subject:value.subject,body:value.body,metadata:value.metadata};return {id:77};});
 m.execute.mockImplementation(async sql=>{
  if(sql==='SELECT * FROM school_session_email_preferences WHERE scope_key=?')return [[{product:'auricwell',agency_id:null,
   recipient_hash:crypto.createHash('sha256').update(input.to).digest('hex'),disabled_at:disabled?'2026-11-04 12:00:00':null}]];
  if(sql==='SELECT metadata FROM user_communications WHERE id=?')return [[{metadata:saved?.metadata}]];
  return sql.trimStart().startsWith('SELECT')?[[]]:[{affectedRows:1}];
 });
});

it('delivers native school CC and retains the exact sender and opt-out scope before transport',async()=>{
 await EmailService.sendEmail(input);
 expect(m.workspace).toHaveBeenCalledWith(expect.objectContaining({to:input.to,cc:input.cc,fromAddress:input.fromAddress,
  fromName:input.fromName,replyTo:input.replyTo,communicationId:77}));
 expect(saved.metadata).toMatchObject({fromEmail:input.fromAddress,fromName:input.fromName,cc:input.cc,
  replyTo:input.replyTo,schoolSessionScopeKey:scope,usedFallbackSender:false});
});

it('preserves native school CC, registered From and scope through manual approval of the saved row',async()=>{
 m.approval.mockResolvedValue(true);
 expect(await EmailService.sendEmail(input)).toMatchObject({pendingApproval:true,communicationId:77});
 expect(m.workspace).not.toHaveBeenCalled();
 expect(await sendCommunicationRecord(saved,saved.metadata,501)).toMatchObject({id:'smtp-accepted'});
 expect(m.workspace).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({cc:input.cc,fromAddress:input.fromAddress,
  fromName:input.fromName,replyTo:input.replyTo,communicationId:77}));
 expect(m.log).toHaveBeenCalledOnce();
});

it('rechecks school-only opt-out before releasing a native reminder from approval',async()=>{
 m.approval.mockResolvedValue(true);await EmailService.sendEmail(input);disabled=true;
 expect(await sendCommunicationRecord(saved,saved.metadata,501)).toMatchObject({skipped:true,reason:'school_session_email_opted_out'});
 expect(m.workspace).not.toHaveBeenCalled();
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("delivery_status = 'skipped'"),
  ['send skipped — school_session_email_opted_out',77]);
 // The preference is scoped to school notices; office appointment mail remains available.
 m.approval.mockResolvedValue(false);
 await EmailService.sendEmail({...input,templateType:'auricwell_session_reminder',schoolSessionScopeKey:null});
 expect(m.workspace).toHaveBeenCalledOnce();
 expect(saved.template_type).toBe('auricwell_session_reminder');
});

it('retains the same native CC and sender after a failed delivery is retried',async()=>{
 m.workspace.mockRejectedValueOnce(new Error('Unconfirmed relay response'));
 await expect(EmailService.sendEmail(input)).rejects.toThrow('Unconfirmed');
 await sendCommunicationRecord(saved,saved.metadata,501);
 expect(m.workspace.mock.lastCall[0]).toMatchObject({cc:input.cc,fromAddress:input.fromAddress,fromName:input.fromName,
  replyTo:input.replyTo,communicationId:77});expect(m.log).toHaveBeenCalledOnce();
});

it('keeps demo redirect copies out of the actual provider envelope',async()=>{
 m.redirect.mockImplementation(async value=>({...value,to:'testing@example.test',cc:null,redirected:true,originalTo:value.to}));
 await EmailService.sendEmail(input);
 expect(m.workspace.mock.lastCall[0]).toMatchObject({to:'testing@example.test',cc:null});
 expect(saved.metadata.cc).toEqual(input.cc); // The original envelope is retained; retries reapply isolation.
});

it('passes persisted CC, display name, Reply-To and school scope to the identity retry path',async()=>{
 const metadata={senderIdentityId:4,fromEmail:input.fromAddress,fromDisplayName:input.fromName,cc:input.cc,
  replyTo:input.replyTo,schoolSessionScopeKey:scope};
 await sendCommunicationRecord({id:77,agency_id:2,recipient_address:input.to,subject:input.subject,body:input.html,
  template_type:input.templateType},metadata,501);
 expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:4,cc:input.cc,
  fromDisplayNameOverride:input.fromName,replyToOverride:input.replyTo,schoolSessionScopeKey:scope,existingCommunicationId:77}));
 expect(m.workspace).not.toHaveBeenCalled();
});
