import {beforeEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),tasks:vi.fn(),rollback:vi.fn(),commit:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,beginTransaction:async()=>{},commit:m.commit,rollback:m.rollback,release:m.release})}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({slug:'itsco'})}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:async()=>[{id:8,identity_key:'schools',from_email:'schools@itsco.health'}]}}));
vi.mock('../schoolEmailPortal.service.js',()=>({SCHOOL_EMAIL_DISPLAY_NAME:'Schools',schoolEmailPortalUrl:async()=> 'https://app.itsco.health/north/dashboard'}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async({user})=>({email:user.email})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../clientOnboardingTask.service.js',()=>({syncClientProviderLifecycleTasks:m.tasks}));
import pool from '../../config/database.js';
import {schoolStatusEmailState,queueSchoolClientStatusEmails,sendPendingSchoolClientStatusEmails} from '../schoolClientStatusEmail.service.js';
import {schoolClientStatusEmailBody} from '../../utils/schoolClientStatusEmailBody.js';
import {emailRequiresAdminApproval} from '../emailSettings.service.js';
let client,providers,state,job,prior;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
beforeEach(()=>{
 vi.clearAllMocks();client={id:1,agency_id:2,organization_id:3,provider_id:5,initials:'MacMck',client_status_key:'ready_to_schedule'};
 providers=[{id:5,first_name:'Mariela',email:'mariela@itsco.health'}];state=schoolStatusEmailState(client,providers);
 job={id:10,client_id:1,agency_id:2,school_organization_id:3,revision:1,state_hash:hash(state),state_json:state};prior={revision:0,state_hash:''};
 m.send.mockResolvedValue({id:'sent',communicationId:20});m.tasks.mockResolvedValue({synced:1});
 m.execute.mockImplementation(async (sql,args)=>{
  if(sql.includes('SELECT GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT * FROM school_client_status_emails'))return [[job]];
  if(sql.startsWith('SELECT j.delivery_status'))return [[{delivery_status:'pending',revision:1}]];
  if(sql.startsWith('SELECT c.*'))return [[client]];
  if(sql.startsWith('SELECT DISTINCT u.*'))return [providers];
  if(sql.startsWith('SELECT DISTINCT a.id'))return [[{id:3}]];
  if(sql.startsWith('SELECT a.name'))return [[{name:'North',itsco_email:'north@itsco.health'}]];
  if(sql.startsWith('SELECT state_hash'))return [[prior]];
  if(sql.startsWith('UPDATE school_client_status_email_states'))prior={state_hash:args[0],revision:args[1]};
  return [{affectedRows:1}];
 });
});
it('queues one saved assignment, not a second notice for repeated saves or scheduling the same provider',async()=>{
 await queueSchoolClientStatusEmails(pool,{clientId:1});await queueSchoolClientStatusEmails(pool,{clientId:1});
 client.client_status_key='scheduled';await queueSchoolClientStatusEmails(pool,{clientId:1});
 expect(m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO school_client_status_emails'))).toHaveLength(1);
 expect(m.send).not.toHaveBeenCalled();expect(m.commit).toHaveBeenCalledTimes(3);
});
it('writes the outbox on the supplied assignment transaction, allowing assignment rollback to roll back the notice',async()=>{
 const transaction={execute:vi.fn(m.execute)};await queueSchoolClientStatusEmails(transaction,{clientId:1});
 expect(transaction.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO school_client_status_emails'),expect.any(Array));expect(m.commit).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
it('sends from Schools to both the school group and assigned provider after initializing the provider workflow',async()=>{
 expect(await sendPendingSchoolClientStatusEmails()).toEqual([{id:10,status:'sent'}]);
 expect(m.tasks).toHaveBeenCalledWith({clientId:1,providerUserIds:[5]});
 expect(m.tasks.mock.invocationCallOrder[0]).toBeLessThan(m.send.mock.invocationCallOrder[0]);
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:8,fromDisplayNameOverride:'Schools',to:['north@itsco.health','mariela@itsco.health'],replyToOverride:'schools@itsco.health',html:expect.stringContaining('new-client workflow has been initiated')}));
});
it('sends waitlist notices without a provider, including the recorded reason',async()=>{
 providers=[];client.client_status_key='waitlist';client.agency_intake_json={waitlistReason:'No available clinician'};state=schoolStatusEmailState(client,providers);job={...job,state_hash:hash(state),state_json:state};
 await sendPendingSchoolClientStatusEmails();expect(m.send).toHaveBeenCalledWith(expect.objectContaining({to:['north@itsco.health'],text:expect.stringContaining('No available clinician')}));expect(m.tasks).not.toHaveBeenCalled();
});
it('does not send stale assignments or duplicate a delivery claimed by another worker',async()=>{
 m.execute.mockImplementationOnce(async()=>[[job]]).mockImplementationOnce(async()=>[[{acquired:1}]]).mockImplementationOnce(async()=>[[{delivery_status:'sent',revision:1}]]);
 await sendPendingSchoolClientStatusEmails();expect(m.send).not.toHaveBeenCalled();
 providers=[];await sendPendingSchoolClientStatusEmails();expect(m.send).not.toHaveBeenCalled();expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("SET delivery_status='obsolete'"),[10]);
});
it('does not automatically resend an ambiguous transport failure',async()=>{
 m.send.mockRejectedValue(new Error('Connection lost after send'));await sendPendingSchoolClientStatusEmails();
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('next_attempt_at=DATE_ADD'),['review',0,'Connection lost after send',10]);
});
it('retries preparation failures without sending, and never marks a blocked send successful',async()=>{
 m.tasks.mockRejectedValueOnce(new Error('Tasks unavailable'));await sendPendingSchoolClientStatusEmails();expect(m.send).not.toHaveBeenCalled();
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('next_attempt_at=DATE_ADD'),['pending',1,'Tasks unavailable',10]);
 m.send.mockResolvedValue({blocked:true,reason:'sender missing'});expect(await sendPendingSchoolClientStatusEmails()).toEqual([{id:10,status:'held'}]);
});
it('escapes user-entered reasons and does not claim intake clearance before it is complete',()=>{
 const copy=schoolClientStatusEmailBody({schoolName:'North',clientLabel:'ABC',providers,kind:'waitlist',reason:'<img onerror=alert(1)>',schoolUrl:'https://example.org/school',providerUrl:'https://example.org/provider'});
 expect(copy.html).not.toContain('<img onerror');expect(copy.html).toContain('&lt;img');
 const assignment=schoolClientStatusEmailBody({schoolName:'North',clientLabel:'ABC',providers,kind:'assigned',schoolUrl:'https://example.org/school',providerUrl:'https://example.org/provider'});
 expect(assignment.text).toContain('Once the client is cleared for intake');
});
it('suppresses terminal clients and recognizes changes to waitlist reasons or provider membership',()=>{
 expect(schoolStatusEmailState({...client,client_status_key:'terminated'},providers).kind).toBe(null);
 expect(schoolStatusEmailState({...client,client_status_key:'waitlist'},providers,'Capacity')).not.toEqual(schoolStatusEmailState({...client,client_status_key:'waitlist'},providers,'Paperwork'));
});
it('sends transactional school status notices without the old digest approval workflow',async()=>{
 expect(await emailRequiresAdminApproval({agencyId:2,templateType:'school_client_status_update'})).toBe(false);
});
