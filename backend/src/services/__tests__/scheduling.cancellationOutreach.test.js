import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
import { createCancellationRecipientService, reviewedEmail, reviewedMessage } from '../cancellationRecipients.service.js';
import { reviewedDayCancellationContext } from '../dayCancellationEmail.service.js';
import { createCancellationSchoolNoticeService } from '../cancellationSchoolNotice.service.js';
import { createReplacementOfferEventService, replacementOutcome } from '../replacementOfferEvents.service.js';

function contacts() {
  const links = [
    { guardian_user_id: 11, relationship_type: 'self', access_enabled: 1, email: 'client@example.test', phone: '+15555550111' },
    { guardian_user_id: 12, relationship_type: 'guardian', access_enabled: 1, first_name: 'Parent', email: 'parent@example.test', phone: '+15555550112' },
    { guardian_user_id: 13, relationship_type: 'guardian', access_enabled: 0, email: 'former@example.test',permissions_json:{revoked:true} }
  ];
  const d = { database: { execute: vi.fn(async () => [[{ id: 8, full_name: 'Client', status: 'ACTIVE' }]]) }, guardians: async () => links,
    consent: vi.fn(async () => ({ email: true, emailAddress: 'client@example.test', phoneNumber: '+15555550111', sms:true })), preferences: vi.fn(async () => ({ isDefault: true })),
    smsConsent: vi.fn(async () => null), gate: vi.fn(async () => ({ allowed: true })),operational:vi.fn(async()=>null), normalizePhone: v => v };
  return { d, links, service: createCancellationRecipientService(d) };
}

describe('reviewed cancellation recipients', () => {
  it('keeps a verified-enrollment caregiver address bound to its signed source during final review',async()=>{
    const h=contacts();h.links.splice(0);
    const service=createCancellationRecipientService({...h.d,caregivers:async()=>[{key:'enrollment:77',role:'guardian',name:'Caregiver',email:'signed@example.test',phone:'',userId:null,operationalOnly:true,intakeSubmissionId:77}]});
    expect((await service.review(8,2,{mode:'guardian',channels:['email']},{required:true,allowMissingEmail:true})).recipients[0].email).toBe('signed@example.test');
    await expect(service.review(8,2,{mode:'guardian',channels:['email'],recipients:[{key:'enrollment:77',email:'different@example.test'}]},{required:true,allowMissingEmail:true})).rejects.toThrow('comes from a saved guardian or enrollment record');
  });
  it('separates verified operational cancellation email from reminder-only channel preferences',async()=>{
    const h=contacts(),recipient=(await h.service.review(8,2)).recipients[0];
    h.d.consent.mockResolvedValue({email:false,emailAddress:'parent@example.test'});h.d.preferences.mockResolvedValue({isDefault:false,channels:{email:false}});
    expect(await h.service.permitted(8,2,recipient,'email')).toBe(false);
    h.d.operational.mockResolvedValue({providerId:7});
    const proof={reviewedCancellationToken:'11111111-1111-4111-8111-111111111111',reviewedCancellationItemKey:'appointment:17',actorUserId:7};
    expect(await h.service.permitted(8,2,recipient,'email',proof)).toBe(true);
    h.d.gate.mockResolvedValue({allowed:false,reason:'enrollment_automatic_email_off'});
    expect(await h.service.permitted(8,2,recipient,'email',proof)).toBe(false);
    h.d.gate.mockResolvedValue({allowed:true});h.d.consent.mockResolvedValue({email:false,sms:false});
    expect(await h.service.permitted(8,2,recipient,'email',proof)).toBe(false);
    h.links[1].access_enabled=0;
    h.d.consent.mockResolvedValue({email:false,emailAddress:null});
    expect(await h.service.permitted(8,2,recipient,'email',proof)).toBe(true);
    h.links[1].permissions_json={revoked:true};expect(await h.service.permitted(8,2,recipient,'email',proof)).toBe(false);
  });
  it('admits a revalidated enrollment-only contact without granting portal access or trusting edited source flags',async()=>{
    const h=contacts();h.links.splice(1);
    const caregiver={key:'enrollment:863',role:'guardian',userId:null,email:'parent@example.test',phone:'',operationalOnly:true,intakeSubmissionId:863};
    const caregivers=vi.fn(async()=>[{...caregiver}]);h.d.consent.mockResolvedValue({email:false,emailAddress:null});
    h.d.preferences.mockResolvedValue({isDefault:false,channels:{email:false}});h.d.operational.mockResolvedValue({providerId:7});
    const service=createCancellationRecipientService({...h.d,caregivers});
    const proof={reviewedCancellationToken:'11111111-1111-4111-8111-111111111111',reviewedCancellationItemKey:'appointment:17',actorUserId:7};
    expect(await service.permitted(8,2,caregiver,'email')).toBe(false);
    expect(await service.permitted(8,2,caregiver,'email',proof)).toBe(true);
    expect(h.d.consent).toHaveBeenCalledWith(8,2,null);expect(h.links).toHaveLength(1);
    expect(await service.permitted(8,2,{...caregiver,email:'edited@example.test'},'email',proof)).toBe(false);
    expect(await service.permitted(8,2,{...caregiver,intakeSubmissionId:999},'email',proof)).toBe(false);
    expect(await service.permitted(8,2,caregiver,'sms',proof)).toBe(false);
    caregivers.mockResolvedValue([]);expect(await service.permitted(8,2,caregiver,'email',proof)).toBe(false);
  });
  it('emails an affiliated legacy disabled guardian regardless of account or portal-view flags, without activating access',async()=>{
    const h=contacts();Object.assign(h.links[1],{access_enabled:0,is_active:0,status:'INACTIVE',permissions_json:{noView:true,canViewAppointments:false}});
    const before=structuredClone(h.links[1]);h.d.operational.mockResolvedValue({providerId:7});h.d.consent.mockResolvedValue({email:false,emailAddress:null});
    const reviewed=await h.service.review(8,2,{mode:'guardian',channels:['email']},{required:true,allowMissingEmail:true});
    expect(reviewed.recipients).toEqual([expect.objectContaining({key:'guardian:12',email:'parent@example.test',operationalOnly:true,source:'affiliated_guardian'})]);
    expect(await h.service.permitted(8,2,reviewed.recipients[0],'email')).toBe(false);
    expect(await h.service.permitted(8,2,reviewed.recipients[0],'email',{reviewedCancellationToken:'11111111-1111-4111-8111-111111111111',reviewedCancellationItemKey:'appointment:17',actorUserId:7})).toBe(true);
    expect(h.links[1]).toEqual(before);
  });
  it.each([{revoked:true},{noContact:true},{contactRestricted:true},{canReceiveNotifications:false}])('keeps actual relationship/contact denial authoritative even with enabled portal %j',async permissions=>{
    const h=contacts();h.links[1].permissions_json=permissions;h.d.operational.mockResolvedValue({providerId:7});
    expect((await h.service.review(8,2,{mode:'guardian',channels:['email']},{required:true,allowMissingEmail:true})).recipients).toEqual([]);
    expect(await h.service.permitted(8,2,{key:'guardian:12',userId:12,email:'parent@example.test'},'email',
      {reviewedCancellationToken:'11111111-1111-4111-8111-111111111111',reviewedCancellationItemKey:'appointment:17',actorUserId:7})).toBe(false);
  });
  it('includes every currently affiliated guardian rather than only the last signer or first disabled account',async()=>{
    const h=contacts();h.links.splice(1,2,
      {guardian_user_id:12,relationship_type:'guardian',access_enabled:0,is_active:0,status:'INACTIVE',email:'one@example.test'},
      {guardian_user_id:14,relationship_type:'guardian',access_enabled:0,status:'PENDING_SETUP',permissions_json:{noView:true},email:'two@example.test'});
    const reviewed=await h.service.review(8,2,{mode:'guardian',channels:['email']},{required:true,allowMissingEmail:true});
    expect(reviewed.recipients.map(recipient=>recipient.email)).toEqual(['one@example.test','two@example.test']);
    h.d.operational.mockResolvedValue({providerId:7});h.d.consent.mockResolvedValue({email:false,emailAddress:null});
    for(const recipient of reviewed.recipients)expect(await h.service.permitted(8,2,recipient,'email',
      {reviewedCancellationToken:'11111111-1111-4111-8111-111111111111',reviewedCancellationItemKey:'appointment:17',actorUserId:7})).toBe(true);
  });
  it('lets an email-only absence continue with no linked guardian or no selected contacts and keeps other workflows strict', async () => {
    const h=contacts();h.links.splice(1);h.links[0].email='';
    expect((await h.service.review(8,2,{mode:'guardian',channels:['email'],recipients:[]},{required:true,allowMissingEmail:true})).recipients).toEqual([]);
    expect((await h.service.review(8,2,{mode:'client',channels:['email'],recipients:[{key:'client',enabled:false}]},{required:true,allowMissingEmail:true})).recipients).toEqual([]);
    await expect(h.service.review(8,2,{mode:'guardian',channels:['email']},{required:true})).rejects.toThrow('Client: No authorized contacts');
    const blank=await h.service.review(8,2,{mode:'client',channels:['email'],recipients:[{key:'client',email:'  '}]},{required:true,allowMissingEmail:true});
    expect(blank.recipients[0].email).toBe('');
    await expect(h.service.review(8,2,{mode:'client',channels:['email'],recipients:[{key:'client',email:'bad-address'}]},{required:true,allowMissingEmail:true})).rejects.toThrow('Client: Client: Enter one valid email');
  });
  it('uses the chosen client/guardian scope, preserves reviewed addresses, and excludes revoked links', async () => {
    const h = contacts();
    const result = await h.service.review(8, 2, { mode: 'both', channels: ['email', 'sms'], recipients: [{ key: 'guardian:12', email: 'new@example.test' }] }, { required: true });
    expect(result.recipients.map(r => r.key)).toEqual(['client', 'guardian:12']);
    expect(result.recipients[1].email).toBe('new@example.test');
    expect(h.d.database.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id=?'), [8, 2]);
    expect(h.d.smsConsent).not.toHaveBeenCalled();
  });
  it('lets staff fix a missing address in review but blocks the final review until it is supplied', async () => {
    const h = contacts(); h.links[1].email = '';
    expect((await h.service.review(8, 2)).recipients[0].email).toBe('');
    await expect(h.service.review(8, 2, null, { required: true })).rejects.toThrow('missing email');
    await expect(h.service.review(8, 2, { recipients: [{ key: 'guardian:99', email: 'outsider@example.test' }] })).rejects.toThrow('no longer linked');
  });
  it('rechecks access, per-recipient preferences, and address-specific SMS consent at delivery', async () => {
    const h = contacts(), recipient = (await h.service.review(8, 2)).recipients[0];
    expect(await h.service.permitted(8, 2, recipient, 'sms')).toBe(false);
    h.d.smsConsent.mockResolvedValue({ collectedAt: '2030-01-01' });
    expect(await h.service.permitted(8, 2, recipient, 'sms')).toBe(true);
    expect(h.d.smsConsent).toHaveBeenLastCalledWith(2, '+15555550112', {clientId:8,recipientUserId:12});
    h.d.consent.mockResolvedValueOnce({ email:true, emailAddress:'parent@example.test', phoneNumber:recipient.phone, sms:false });
    expect(await h.service.permitted(8, 2, recipient, 'sms')).toBe(false);
    h.d.preferences.mockResolvedValue({ schedulingChangesEnabled: false });
    expect(await h.service.permitted(8, 2, recipient, 'email')).toBe(false);
    h.d.preferences.mockResolvedValue({ isDefault: true }); h.links[1].access_enabled = 0;
    expect(await h.service.permitted(8, 2, recipient, 'email')).toBe(false);
  });
  it('rejects header injection and multiple addresses while retaining plain-text edits', () => {
    expect(() => reviewedEmail('one@example.test,other@example.test')).toThrow('one valid');
    expect(() => reviewedMessage({ subject: 'Hi\nBcc: someone@example.test', text: 'Cancellation' })).toThrow('subject');
    expect(reviewedMessage({ subject: 'School update', text: 'Edited reason\nNext step' })).toEqual({ subject: 'School update', text: 'Edited reason\nNext step' });
  });
});

describe('saved cancellation final-envelope recipient admission',()=>{
  function retryFixture({enrollment=false,temporary=false,disabled=false}={}) {
    const token='11111111-1111-4111-8111-111111111111',proof={reviewedCancellationToken:token,reviewedCancellationItemKey:'appointment:17'};
    let guardian={guardian_user_id:12,relationship_type:'guardian',access_enabled:disabled?0:1,is_active:disabled?0:1,
      status:disabled?'INACTIVE':'ACTIVE',permissions_json:disabled?{noView:true,canViewAppointments:false}:{},email:'source@example.test'};
    let caregiver={key:'enrollment:77',role:'guardian',userId:null,email:'source@example.test',phone:'',operationalOnly:true,intakeSubmissionId:77,source:'submitted_school_enrollment'};
    const contact=enrollment?{...caregiver}:{key:'guardian:12',role:'guardian',userId:12,email:guardian.email,
      ...(disabled?{operationalOnly:true,source:'affiliated_guardian'}:{})};
    const recipient={...contact,email:temporary?'reviewed@example.test':contact.email};
    const plan={date:'2026-11-04',providerId:776,messagesReviewed:true,facts:{reasonCategory:'illness',notificationMode:'send'},scopes:[{agencyId:2}],items:[{
      key:'appointment:17',kind:'appointment',agencyId:2,clients:[{clientId:8,mode:'guardian',contacts:[contact],recipients:[recipient]}]}]};
    const row={provider_id:776,actor_user_id:776,status:'completed',signed_at:'2026-11-04 15:00:00',plan_json:JSON.stringify(plan)};
    const communication={agency_id:2,recipient_address:recipient.email,metadata:{...proof,cc:['support@itsco.health'],source:'manual'}};
    let schoolAffiliated=true;
    const database={execute:vi.fn(async sql=>{
      if(sql.includes('FROM provider_day_cancellations'))return [[{...row,plan_json:JSON.stringify(plan)}]];
      if(sql.includes('FROM user_communications'))return [[communication]];
      if(sql.includes('FROM clients c'))return [[{id:8,full_name:'Client',status:'ACTIVE'}]];
      if(sql.includes('FROM agencies school'))return [schoolAffiliated?[{id:21}]:[]];
      if(sql.includes('FROM users u JOIN user_agencies'))return [[{id:776,work_email:'provider@itsco.health'}]];
      throw new Error(`Unexpected query: ${sql}`);
    })};
    const gate=vi.fn(async()=>({allowed:true})),preferences=vi.fn(async()=>({isDefault:false,channels:{email:false}}));
    const service=createCancellationRecipientService({database,guardians:async()=>!enrollment&&guardian?[guardian]:[],
      caregivers:async()=>enrollment&&caregiver?[caregiver]:[],consent:async()=>({email:false,emailAddress:null}),preferences,gate,
      operational:reviewedDayCancellationContext,normalizePhone:x=>x});
    const deps={database,decrypt:x=>x,domain:async()=> 'itsco.health',verifyEnvelope:true,
      currentRecipient:(clientId,agencyId,value,context)=>service.permitted(clientId,agencyId,value,'email',{
        ...proof,actorUserId:776,validatedContext:context})};
    const input={...proof,agencyId:2,clientId:8,to:recipient.email,cc:['support@itsco.health'],templateType:'day_cancellation',generatedByUserId:776};
    return {plan,contact,recipient,gate,preferences,initial:()=>reviewedDayCancellationContext(input,deps),
      retry:()=>reviewedDayCancellationContext({...input,reviewedCancellationToken:null,reviewedCancellationItemKey:null,existingCommunicationId:91,generatedByUserId:99},deps),
      removeGuardian:()=>{guardian=null;},revokeGuardian:()=>{guardian.permissions_json={revoked:true};},
      changeGuardianEmail:()=>{guardian.email='changed@example.test';},changeEnrollmentEmail:()=>{caregiver.email='changed@example.test';},
      replaceEnrollment:()=>{caregiver={...caregiver,key:'enrollment:88',intakeSubmissionId:88};},
      school:()=>{input.clientId=null;plan.items[0]={key:'appointment:17',kind:'school',agencyId:2,id:21,date:'2026-11-04',recipients:[recipient.email]};},
      revokeSchool:()=>{schoolAffiliated=false;},report:()=>reviewedDayCancellationContext({...input,clientId:null,templateType:'day_cancellation_contact_followup',to:['provider@itsco.health','support@itsco.health'],cc:null},deps)};
  }
  it.each(['removed','revoked'])('blocks a persisted retry when the guardian relationship is %s after queueing',async change=>{
    const h=retryFixture();expect(await h.initial()).toBeTruthy();
    change==='removed'?h.removeGuardian():h.revokeGuardian();
    await expect(h.retry()).rejects.toThrow('contact or notification permission has changed');
  });
  it.each(['email changed','source replaced'])('blocks a persisted retry when the signed enrollment %s after queueing',async change=>{
    const h=retryFixture({enrollment:true});expect(await h.initial()).toBeTruthy();
    change==='email changed'?h.changeEnrollmentEmail():h.replaceEnrollment();
    await expect(h.retry()).rejects.toThrow('contact or notification permission has changed');
  });
  it('allows the reviewed temporary destination only while its canonical source contact is unchanged',async()=>{
    const h=retryFixture({temporary:true});expect(await h.initial()).toBeTruthy();expect(await h.retry()).toBeTruthy();
    h.changeGuardianEmail();await expect(h.retry()).rejects.toThrow('contact or notification permission has changed');
  });
  it('retains current disabled affiliated guardian eligibility but rechecks actual category opt-outs',async()=>{
    const h=retryFixture({disabled:true});expect(await h.initial()).toBeTruthy();expect(await h.retry()).toBeTruthy();
    h.gate.mockResolvedValue({allowed:false,reason:'family_notification_category_off'});
    await expect(h.retry()).rejects.toThrow('contact or notification permission has changed');
  });
  it('rechecks explicit schedule-change preferences on retry',async()=>{
    const h=retryFixture();expect(await h.initial()).toBeTruthy();h.preferences.mockResolvedValue({schedulingChangesEnabled:false});
    await expect(h.retry()).rejects.toThrow('contact or notification permission has changed');
  });
  it('keeps the internal contact follow-up available when a family relationship is removed',async()=>{
    const h=retryFixture();h.removeGuardian();expect(await h.report()).toBeTruthy();
  });
  it('rechecks provider school agency affiliation while preserving a reviewed temporary school address',async()=>{
    const h=retryFixture({temporary:true});h.school();expect(await h.initial()).toBeTruthy();expect(await h.retry()).toBeTruthy();
    h.revokeSchool();await expect(h.retry()).rejects.toThrow('no longer affiliated');
  });
});

describe('school cancellation review and delivery', () => {
  it('loads only assignments for the selected provider, agency and weekday, without sending', async () => {
    const database = { execute: vi.fn(async () => [[{ id: 21, name: 'School', provider_name: 'Provider', itsco_email: 'group@example.test', primary_contact_email: 'school@example.test' }]]) };
    const sendEmail = vi.fn(), service = createCancellationSchoolNoticeService({ database, sendEmail });
    const [school] = await service.list({ providerId: 7, agencyId: 2, date: '2030-01-02', reason: 'Unavailable' });
    expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('oa.agency_id=?'), [2, 7, 'Wednesday']);
    expect(school.recipients).toEqual(['group@example.test']);
    expect(service.review(school, { recipients: ['changed@example.test', 'added@example.test'], message: { subject: 'Edited', text: 'My message' } }, true)).toMatchObject({ recipients: ['changed@example.test', 'added@example.test'], message: { subject: 'Edited', text: 'My message' } });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(() => service.review(school, { recipients: [] }, true)).toThrow('school email');
  });
  it('sends the reviewed school text separately and prevents duplicate or uncertain retries', async () => {
    const rows = new Map();
    const database = { execute: vi.fn(async (sql, p) => {
      if (sql.startsWith('INSERT IGNORE')) { if (!rows.has(p[2])) rows.set(p[2], { status: 'pending', recipient_address: p[2] }); return [{}]; }
      if (sql.includes("SET status='sending'")) { const r = rows.get(p[2]); const affectedRows = ['pending', 'failed'].includes(r.status) ? 1 : 0; if (affectedRows) r.status = 'sending'; return [{ affectedRows }]; }
      if (sql.includes('SET external_message_id=')) return [{}];
      if (sql.startsWith('UPDATE')) { Object.assign(rows.get(p[6]), { status: p[0], error_message: p[1] }); return [{}]; }
      if (sql.startsWith('SELECT')) return [[rows.get(p[2])]];
      throw new Error(sql);
    }) };
    const sendEmail = vi.fn().mockResolvedValueOnce({ id: 'accepted' }).mockRejectedValueOnce(new Error('Connection lost'));
    const service = createCancellationSchoolNoticeService({ database, sendEmail });
    const item = { key: 'school:2:21:2030-01-02', agencyId: 2, recipients: ['school@example.test', 'extra@example.test'], message: { subject: 'Edited subject', text: 'Edited message <safe>' } };
    const first = await service.send('token', item, 7); await service.send('token', item, 7);
    expect(first).toMatchObject({ sent: 1, held: 1 }); expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'school@example.test', subject: 'Edited subject', text: 'Edited message <safe>', html: '<p>Edited message &lt;safe&gt;</p>' });
    expect(rows.get('extra@example.test').status).toBe('review');
  });
});

describe('rescheduling outcome documentation', () => {
  it('distinguishes automatic booking, legacy denial, confirmed booking, and no response with or without a next session', () => {
    expect(replacementOutcome('requested')).toContain('being booked automatically');
    expect(replacementOutcome('confirmed', null, 22)).toContain('confirmed and scheduled (appointment #22)');
    expect(replacementOutcome('declined_by_team')).toContain('requested session denied');
    expect(replacementOutcome('expired', { displayWhen: 'Thursday' })).toContain('no response; next session scheduled for Thursday');
    expect(replacementOutcome('expired')).toContain('no next session is currently scheduled');
  });
  it('records outcomes in the caller’s transaction and notifies the provider only after confirmation', async () => {
    const connection = { execute: vi.fn() };
    const service = createReplacementOfferEventService();
    await service.record({ id: 8 }, 'requested', connection);
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE'), [8, 'requested', expect.stringContaining('reschedule requested'), 'suppressed']);
    await service.record({ id: 8, linked_appointment_id: 22 }, 'confirmed', connection);
    expect(connection.execute).toHaveBeenLastCalledWith(expect.any(String), [8, 'confirmed', expect.stringContaining('#22'), 'pending']);
  });
});
