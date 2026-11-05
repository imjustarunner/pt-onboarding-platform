import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:async()=> 'itsco.health'}));
vi.mock('../familyNotificationChoices.service.js',()=>({familyNotificationDeliveryGate:vi.fn(async()=>({allowed:true}))}));
// Current-contact policy is covered with the real service in cancellationOutreach.
vi.mock('../cancellationRecipients.service.js',()=>({cancellationRecipients:{permitted:vi.fn(async()=>true)}}));
import { resolveDayCancellationEmail, reviewedDayCancellationContext } from '../dayCancellationEmail.service.js';
import { routineParentEmailGate } from '../routineParentEmailPause.service.js';
import { familyNotificationDeliveryGate } from '../familyNotificationChoices.service.js';

const token='11111111-1111-4111-8111-111111111111';
const proof={reviewedCancellationToken:token,reviewedCancellationItemKey:'appointment:17'};
let provider,plan,row,communication,db;
beforeEach(()=>{
 vi.clearAllMocks();familyNotificationDeliveryGate.mockResolvedValue({allowed:true});
 provider={id:776,work_email:'danica@itsco.health',email:'login@itsco.health',first_name:'Danica',last_name:'Provider'};
 plan={providerId:776,messagesReviewed:true,facts:{reasonCategory:'illness',notificationMode:'send',providerAuthored:true},scopes:[{agencyId:2}],
  items:[{key:'appointment:17',kind:'appointment',agencyId:2,clients:[{clientId:8,mode:'guardian',recipients:[{email:'parent@example.test'}]}]}]};
 row={provider_id:776,actor_user_id:776,status:'processing',signed_at:'2026-11-04 15:00:00'};
 communication={agency_id:2,recipient_address:'parent@example.test',metadata:{...proof,source:'manual',cc:['support@itsco.health']}};
 db={execute:vi.fn(async(sql,args)=>{
  if(sql.includes('FROM provider_day_cancellations'))return [args[0]===token?[{...row,plan_json:JSON.stringify(plan)}]:[]];
  if(sql.includes('FROM user_communications'))return [[communication]];
  if(sql.includes('FROM users u JOIN user_agencies'))return [[provider]];
  if(sql.includes('agency_parent_email_controls'))return [[{routine_emails_paused:1}]];
  if(sql.includes('FROM users WHERE'))return [[{email:'parent@example.test',role:'client_guardian'}]];
  return [[]];
 })};
});
const input=()=>({...proof,agencyId:2,clientId:8,to:'parent@example.test',cc:['support@itsco.health'],templateType:'day_cancellation',generatedByUserId:776});
const deps=()=>({database:db,decrypt:x=>x,domain:async()=> 'itsco.health'});

it('uses the tenant messages identity for SSO with provider Reply-To and support CC',async()=>{
 const personal=vi.fn(async()=>({identity:{id:9,agency_id:2,is_active:1},routing:'workspace_user',replyTo:'messages@itsco.health'}));
 const envelope=await resolveDayCancellationEmail({agencyId:2,providerId:776,providerAuthored:true,actorUserId:776,...proof},
  {...deps(),agency:async()=>({id:2,name:'ITSCO'}),personal});
 expect(personal).toHaveBeenCalledWith({agencyId:2,userId:776});
 expect(envelope).toMatchObject({senderIdentityId:9,replyToOverride:'support@itsco.health',cc:['support@itsco.health'],
  providerEmail:'danica@itsco.health',supportEmail:'support@itsco.health',source:'manual',...proof});
});
it('uses a shared messages sender when staff cancel on behalf of the provider',async()=>{
 const personal=vi.fn(),messages=vi.fn(async()=>({identity:{id:9,agency_id:2,is_active:1}}));
 const envelope=await resolveDayCancellationEmail({agencyId:2,providerId:776,providerAuthored:false,actorUserId:99},
  {...deps(),agency:async()=>({id:2,name:'ITSCO'}),personal,messages});
 expect(personal).not.toHaveBeenCalled();expect(messages).toHaveBeenCalledWith(2);
 expect(envelope).toMatchObject({replyToOverride:'support@itsco.health',cc:['support@itsco.health']});
});
it('rejects provider impersonation or an identity from another agency',async()=>{
 const options={...deps(),agency:async()=>({id:2,name:'ITSCO'}),personal:async()=>({identity:{id:9,agency_id:6,is_active:1}})};
 await expect(resolveDayCancellationEmail({agencyId:2,providerId:776,providerAuthored:true,actorUserId:99},options)).rejects.toThrow('provider’s reviewed action');
 await expect(resolveDayCancellationEmail({agencyId:2,providerId:776,providerAuthored:true,actorUserId:776},options)).rejects.toThrow('unavailable');
});
it('authorizes only the exact saved reviewed client, agency, actor and recipient',async()=>{
 expect(await reviewedDayCancellationContext(input(),deps())).toMatchObject({providerId:776,actorUserId:776,...proof});
 for(const changed of [{to:'other@example.test'},{clientId:9},{agencyId:6},{generatedByUserId:99},
  {reviewedCancellationToken:'22222222-2222-4222-8222-222222222222'},{reviewedCancellationItemKey:'appointment:99'}])
  await expect(reviewedDayCancellationContext({...input(),...changed},deps())).rejects.toHaveProperty('status',403);
});
it.each(['unsigned','preview','unreviewed','suppressed'])('denies a %s plan instead of treating a raw class name as authority',async state=>{
 if(state==='unsigned')row.signed_at=null;
 if(state==='preview')row.status='preview';
 if(state==='unreviewed')plan.messagesReviewed=false;
 if(state==='suppressed')plan.facts.notificationMode='none';
 await expect(reviewedDayCancellationContext(input(),deps())).rejects.toHaveProperty('status',403);
 await expect(reviewedDayCancellationContext({...input(),reviewedCancellationToken:null},deps())).rejects.toHaveProperty('status',403);
});
it('reloads durable signed proof on a staff retry and checks the stored communication scope',async()=>{
 expect(await reviewedDayCancellationContext({...input(),reviewedCancellationToken:null,reviewedCancellationItemKey:null,
  existingCommunicationId:77,generatedByUserId:99},deps())).toMatchObject(proof);
 communication.agency_id=6;
 await expect(reviewedDayCancellationContext({...input(),existingCommunicationId:77},deps())).rejects.toThrow('another recipient or agency');
});
it('allows the initials follow-up only to the provider and agency support',async()=>{
 const report={...input(),templateType:'day_cancellation_contact_followup',to:['support@itsco.health','danica@itsco.health']};
 expect(await reviewedDayCancellationContext(report,deps())).toMatchObject(proof);
 await expect(reviewedDayCancellationContext({...report,to:'parent@example.test'},deps())).rejects.toThrow('not included');
});
it.each([{cc:['outsider@example.test']},{cc:['support@itsco.health','outsider@example.test']},{cc:null},{bcc:'outsider@example.test'}])
('rejects an unapproved actual cancellation copy envelope %j',async change=>{
 await expect(reviewedDayCancellationContext({...input(),...change},{...deps(),verifyEnvelope:true})).rejects.toThrow('current supervisors');
});
it.each([{cc:['outsider@example.test']},{bcc:['outsider@example.test']}])('rejects stored retry copy tampering even when supplied actual CC looks safe %j',async change=>{
 Object.assign(communication.metadata,change);
 await expect(reviewedDayCancellationContext({...input(),existingCommunicationId:77},{...deps(),verifyEnvelope:true})).rejects.toThrow('current supervisors');
});
it('exempts a signed cancellation from the rollout reminder pause while retaining schedule-change opt-outs',async()=>{
 expect(await routineParentEmailGate(input(),db)).toEqual({allowed:true});
 expect(db.execute.mock.calls.some(([sql])=>sql.includes('agency_parent_email_controls'))).toBe(false);
 expect(familyNotificationDeliveryGate).toHaveBeenCalledWith(expect.objectContaining({notificationCategory:'schedule_changes'}),db);
 familyNotificationDeliveryGate.mockResolvedValue({allowed:false,reason:'family_notification_category_off'});
 expect(await routineParentEmailGate(input(),db)).toMatchObject({allowed:false,reason:'family_notification_category_off'});
 expect(await routineParentEmailGate({...input(),templateType:'school_session_notice'},db)).toMatchObject({allowed:false,reason:'routine_parent_emails_paused'});
});
