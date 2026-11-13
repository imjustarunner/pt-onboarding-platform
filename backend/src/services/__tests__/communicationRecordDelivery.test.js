import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({identity:vi.fn(),legacy:vi.fn(),attachments:vi.fn(),payrollAttachments:vi.fn(),update:vi.fn(),link:vi.fn(),enrollment:vi.fn()}));
vi.mock('../../models/IntakeLink.model.js',()=>({default:{findById:m.link}}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:m.enrollment}));
vi.mock('../email.service.js',()=>({default:{sendEmail:m.legacy}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.identity}));
vi.mock('../../models/UserCommunication.model.js',()=>({default:{updateDeliveryStatus:m.update}}));
vi.mock('../familyLedger/receiptDeliveryRetry.js',()=>({receiptRetryAttachments:m.attachments}));
vi.mock('../payrollReportEmail.service.js',()=>({default:{retryAttachments:m.payrollAttachments}}));
import {sendCommunicationRecord,recordCommunicationSent,communicationRecordAttachments} from '../communicationRecordDelivery.service.js';
import {validateOutboundEmailQuality} from '../outboundEmailQuality.service.js';
const comm={id:100,agency_id:2,user_id:5,client_id:8,recipient_address:'payer@example.com',subject:'Receipt R-2-91',body:'<p>Your receipt is attached.</p>',template_type:'family_payment_receipt'};
beforeEach(()=>{vi.clearAllMocks();m.attachments.mockResolvedValue([{filename:'R-2-91.pdf',contentType:'application/pdf',contentBase64:'JVBERg=='}]);m.identity.mockResolvedValue({id:'gmail-91',threadId:'gmail-thread'});});
it('preserves the real PDF when a queued receipt is approved or retried',async()=>{await sendCommunicationRecord(comm,{senderIdentityId:7,replyTo:'billing@example.com'},501);expect(m.attachments).toHaveBeenCalledWith({communication:comm,actorUserId:501,senderIdentityId:7});expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({existingCommunicationId:100,to:'payer@example.com',senderIdentityId:7,attachments:[expect.objectContaining({filename:'R-2-91.pdf',contentBase64:'JVBERg=='})]}));});
it('never falls back to a bare email if the linked PDF or its permission is unavailable',async()=>{m.attachments.mockRejectedValue(Object.assign(Error('Denied'),{status:403}));await expect(sendCommunicationRecord(comm,{senderIdentityId:7},501)).rejects.toMatchObject({status:403});expect(m.identity).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();});
it('keeps sibling history copies from sending a second family email',async()=>{await expect(sendCommunicationRecord(comm,{senderIdentityId:7,isSiblingMirror:true},501)).rejects.toMatchObject({status:409});expect(m.identity).not.toHaveBeenCalled();});
it('keeps ordinary reviewed email behavior without trying to attach a receipt',async()=>{await sendCommunicationRecord({...comm,template_type:'manual'},{senderIdentityId:7},501);expect(m.attachments).not.toHaveBeenCalled();expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({attachments:[]}));});
it('stores the Gmail thread reference in metadata and leaves the delivery timestamp empty',async()=>{await recordCommunicationSent(comm,{qualityFlags:['old']},{id:'gmail-91',threadId:'gmail-thread'},501);expect(m.update).toHaveBeenCalledWith(100,'sent','gmail-91',null,null,expect.objectContaining({threadId:'gmail-thread',retriedByUserId:501}));expect(m.update.mock.calls[0][5].qualityFlags).toBeUndefined();});
it.each([{queued:true},{id:'x',pendingApproval:true},{}])('does not mark an unconfirmed retry sent',async result=>{await expect(recordCommunicationSent(comm,{},result,501)).rejects.toMatchObject({status:409});expect(m.update).not.toHaveBeenCalled();});

it('preserves sender metadata and returns the approved record without treating a thread ID as delivery time',async()=>{m.update.mockResolvedValue({id:100,delivery_status:'sent'});expect(await recordCommunicationSent(comm,{senderIdentityId:7,replyTo:'billing@example.com'},{id:'gmail-91',threadId:'gmail-thread'},501,{approved:true})).toEqual({id:100,delivery_status:'sent'});expect(m.update).toHaveBeenCalledWith(100,'sent','gmail-91',null,null,expect.objectContaining({senderIdentityId:7,replyTo:'billing@example.com',approvedByUserId:501,threadId:'gmail-thread'}));});

it('uses the rebuilt PDF in retry quality review and then sends that same attachment',async()=>{const attachments=await communicationRecordAttachments(comm,{senderIdentityId:7},501);expect(validateOutboundEmailQuality({subject:comm.subject,html:comm.body,templateType:comm.template_type,attachments}).ok).toBe(true);await sendCommunicationRecord(comm,{senderIdentityId:7},501,{attachments});expect(m.attachments).toHaveBeenCalledTimes(1);expect(m.identity.mock.calls[0][0].attachments).toBe(attachments);});

it('restores the exact retained payroll CSV when a queued payroll report is approved',async()=>{
 const payroll={...comm,agency_id:6,recipient_address:'payroll@agency.example',template_type:'payroll_posted_reconciliation'};
 const attachments=[{filename:'payroll.csv',contentType:'text/csv; charset=utf-8',contentBase64:'U3ludGhldGljLENTVg=='}];
 m.payrollAttachments.mockResolvedValue(attachments);
 await sendCommunicationRecord(payroll,{senderIdentityId:41},501);
 expect(m.payrollAttachments).toHaveBeenCalledWith({communication:payroll,actorUserId:501,senderIdentityId:41});
 expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({existingCommunicationId:100,senderIdentityId:41,attachments}));
});
it('never approves a bare payroll email if its retained CSV or payroll access is unavailable',async()=>{
 m.payrollAttachments.mockRejectedValue(Object.assign(new Error('Synthetic payroll access denied'),{status:403}));
 await expect(sendCommunicationRecord({...comm,template_type:'payroll_posted_reconciliation'},{senderIdentityId:41},501)).rejects.toMatchObject({status:403});
 expect(m.identity).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();
});

it('recovers a failed tutoring receipt through its exact enrollment sender without replacing the record',async()=>{
 m.link.mockResolvedValue({id:355,organization_id:453,master_channel:'tutoring',language_code:'en'});
 const failed={...comm,id:6349,agency_id:453,template_type:'enrollment_submission_confirmation',delivery_status:'failed'};
 await sendCommunicationRecord(failed,{intakeLinkId:355},1435);
 expect(m.enrollment).toHaveBeenCalledWith(expect.objectContaining({existingCommunicationId:6349,agencyId:453,enrollmentChannel:'tutoring'}));expect(m.legacy).not.toHaveBeenCalled();
 m.link.mockResolvedValue({organization_id:6,master_channel:'tutoring'});
 await expect(sendCommunicationRecord(failed,{intakeLinkId:355},1435)).rejects.toMatchObject({status:403});
});
