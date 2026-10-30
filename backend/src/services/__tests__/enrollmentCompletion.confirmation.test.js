import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../models/IntakeSubmission.model.js',()=>({default:{}}));
vi.mock('../../models/IntakeLink.model.js',()=>({default:{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../models/UserCommunication.model.js',()=>({default:{}}));
vi.mock('../../models/Task.model.js',()=>({default:{}}));
import { sendEnrollmentReceiptOnce } from '../enrollmentConfirmation.service.js';
import { ENROLLMENT_EMAIL_NOTICE_VERSION } from '../intakeCommunicationChoices.service.js';
let cp, submission, deps, send, records, chain;
const message={agencyId:2,clientId:8,to:'parent@example.test',intakeSubmissionId:10,intakeLinkId:3,
 templateType:'intake_packet_completion',subject:'Private clinical packet',text:'Child details and signed packet',html:'<p>Private PDF</p>',attachments:[{filename:'signed.pdf'}]};
beforeEach(()=>{
 cp={agencyId:2,emailNoticeVersion:ENROLLMENT_EMAIL_NOTICE_VERSION,signatureAccepted:true,signedAt:'2026-10-28T12:00:00Z',emailPreference:'no',smsPreference:'no',noRoutineCalls:false,noAutomaticEmail:false};
 submission={id:10,intake_link_id:3,status:'submitted',signer_email:message.to,client_id:8,guardian_user_id:20,intake_data:{submission:{communicationPreferences:cp}}};
 records=[];chain=Promise.resolve();
 deps={links:{findById:vi.fn(async()=>({language_code:'en'}))},submissions:{findById:vi.fn(async()=>submission)},agencies:{findById:vi.fn(async()=>({id:2,slug:'tenant'}))},tasks:{create:vi.fn(async()=>({id:9}))},
  communications:{create:vi.fn(async data=>{const row={...data,id:records.length+1,delivery_status:'pending'};records.push(row);return row;})},
  db:{getConnection:vi.fn(async()=>{let unlock;return {release:vi.fn(),execute:vi.fn(async(sql,args)=>{
   if(sql.includes('GET_LOCK')){const previous=chain;chain=new Promise(resolve=>{unlock=resolve;});await previous;return [[{acquired:1}]];}
   if(sql.includes('RELEASE_LOCK')){unlock?.();return [[]];}
   if(sql.includes('FROM tasks'))return [[]];
   if(sql.includes('SELECT id,delivery_status'))return [records.filter(r=>r.agencyId===args[0]&&r.recipientAddress===args[1]&&String(r.metadata.intakeSubmissionId)===args[2]).slice(-1)];
   if(sql.startsWith('UPDATE')){const row=records.find(r=>r.id===(sql.includes('metadata=JSON_SET')?args[4]:args[1]));if(row){row.delivery_status=sql.includes('metadata=JSON_SET')?args[0]:'failed';row.error_message=sql.includes('metadata=JSON_SET')?args[1]:args[0];}return [{affectedRows:1}];}
   throw Error('Unexpected query: '+sql);
  })};})}};
 send=vi.fn(async()=>({sent:true,id:'message-1'}));
});
const deliver=(input=message)=>sendEnrollmentReceiptOnce(input,send,deps);
it('replaces the packet email with one minimal receipt when optional email is off',async()=>{
 const result=await deliver();expect(result.sent).toBe(true);expect(send).toHaveBeenCalledTimes(1);
 const outbound=send.mock.calls[0][0];expect(outbound).toMatchObject({templateType:'enrollment_submission_confirmation',attachments:null,existingCommunicationId:1,preloggedReceipt:true});
 expect(outbound.text).toContain('/login');expect(outbound.text).not.toContain('Child details');expect(outbound.html).not.toContain('Private PDF');
 expect(records).toHaveLength(1);
});
it('sends once for concurrent finalization, refresh and sibling clients',async()=>{
 const outcomes=await Promise.all([deliver(),deliver({...message,clientId:9}),deliver()]);
 expect(send).toHaveBeenCalledTimes(1);expect(records).toHaveLength(1);expect(outcomes.filter(r=>r.deduplicated)).toHaveLength(2);
});
it.each([{sent:false,queued:true,reason:'requires_approval'},{sent:false,skipped:true,reason:'opted_out'}])('does not retry a recorded held or skipped receipt on refresh',async outcome=>{
 send.mockResolvedValue(outcome);await deliver();const again=await deliver();expect(again.deduplicated).toBe(true);expect(send).toHaveBeenCalledTimes(1);
});
it('retains one failed receipt for deliberate review when transport fails',async()=>{
 send.mockRejectedValue(Error('Network interrupted'));await expect(deliver()).rejects.toMatchObject({communicationId:1});
 expect(await deliver()).toMatchObject({sent:false,deduplicated:true,communicationId:1});expect(send).toHaveBeenCalledTimes(1);expect(records[0].delivery_status).toBe('failed');
});
it('honors no automatic email and creates an encrypted staff follow-up without affecting SMS',async()=>{
 Object.assign(cp,{noAutomaticEmail:true,smsPreference:'scheduling_only',alternativeContactInstructions:'Use the portal'});
 expect(await deliver()).toMatchObject({skipped:true,reason:'enrollment_automatic_email_off'});await deliver();
 expect(send).not.toHaveBeenCalled();expect(deps.tasks.create).toHaveBeenCalledTimes(1);expect(deps.tasks.create).toHaveBeenCalledWith(expect.objectContaining({encryptDescription:true,assignedToAgencyId:2}));
 expect(cp.smsPreference).toBe('scheduling_only');expect(records[0].body).not.toContain('Use the portal');
});
it('flags an all-off routine contact choice for staff review',async()=>{
 cp.noRoutineCalls=true;await deliver();expect(deps.tasks.create).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
});
it('retains the safe receipt if staff follow-up cannot be recorded',async()=>{
 cp.noAutomaticEmail=true;deps.tasks.create.mockRejectedValue(Error('Task unavailable'));
 await expect(deliver()).rejects.toMatchObject({communicationId:1});expect(send).not.toHaveBeenCalled();expect(records[0].templateType).toBe('enrollment_submission_confirmation');
});
it('keeps legacy saved choices under the old packet policy',async()=>{
 delete cp.emailNoticeVersion;await deliver();expect(send).toHaveBeenCalledWith(expect.objectContaining({templateType:'intake_packet_completion',attachments:message.attachments}));
});
it('rejects an unfinished enrollment, mismatched recipient or agency',async()=>{
 submission.status='started';await expect(deliver()).rejects.toThrow('completed enrollment');submission.status='submitted';
 await expect(deliver({...message,to:'other@example.test'})).rejects.toThrow('signer');await expect(deliver({...message,agencyId:99})).rejects.toThrow('different agency');expect(send).not.toHaveBeenCalled();
});
it('does not turn provider acceptance into a failed send when updating the receipt fails',async()=>{
 const getConnection=deps.db.getConnection.getMockImplementation();
 deps.db.getConnection.mockImplementation(async()=>{
  const connection=await getConnection(),execute=connection.execute.getMockImplementation();
  connection.execute.mockImplementation((q,a)=>q.includes('metadata=JSON_SET')?Promise.reject(Error('Database interrupted')):execute(q,a));return connection;
 });
 expect(await deliver()).toMatchObject({sent:true,communicationId:1});expect(await deliver()).toMatchObject({deduplicated:true});expect(send).toHaveBeenCalledTimes(1);expect(records[0].delivery_status).not.toBe('failed');
});

it('uses the saved Spanish form locale for the subject, body and branded footer',async()=>{
 deps.links.findById.mockResolvedValue({language_code:'es'});await deliver({...message,schoolOrganizationId:30});
 const outbound=send.mock.calls[0][0];expect(outbound.subject).toBe('Inscripción recibida');expect(outbound.locale).toBe('es');
 expect(outbound.text).toContain('equipo escolar');expect(outbound.text).not.toContain('Enrollment received');expect(outbound.attachments).toBeNull();
});
it('honors an explicitly saved Spanish language even when the link began in English',async()=>{
 submission.intake_data.formLocale='es';await deliver();expect(send.mock.calls[0][0].subject).toBe('Inscripción recibida');
});
