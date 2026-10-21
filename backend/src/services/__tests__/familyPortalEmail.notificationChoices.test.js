import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({intake:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../intakeCommunicationChoices.service.js',()=>({latestIntakeCommunicationChoices:m.intake}));
import {familyContactHash,familyNotificationInvitationContext,saveFamilyNotificationChoices,familyNotificationDeliveryGate,createFamilyNotificationInvitation,latestFamilyEmailSchedulingChoice} from '../familyNotificationChoices.service.js';
import {FAMILY_NOTIFICATION_CATEGORIES,FAMILY_ACCOUNT_UPDATE_CATEGORIES,FAMILY_CHOICE_VERSION,normalizeFamilyChoices,normalizeAccountUpdateChoices} from '../../utils/familyNotificationChoices.js';
const token='a'.repeat(64),email='guardian@example.test';
const all=choice=>Object.fromEntries(FAMILY_NOTIFICATION_CATEGORIES.map(c=>[c.key,choice]));
const select=choice=>Object.fromEntries(FAMILY_ACCOUNT_UPDATE_CATEGORIES.map(c=>[c.key,c.emailOnly&&['sms','both'].includes(choice)?'email':choice]));
let db,scope,recipient,saved,school;
beforeEach(()=>{
  m.intake.mockResolvedValue(null);saved=null;school=null;
  scope={agency_id:2,client_id:22,guardian_user_id:50,recipient_hash:familyContactHash(email),expires_at:new Date(Date.now()+86400000)};
  recipient={email,first_name:'Demo',last_name:'Guardian',full_name:'Demo Child',client_type:'school',agency_name:'ITSCO',permissions_json:null,access_enabled:1,phone:'+17195550100'};
  db={execute:vi.fn(async(sql,args)=>{
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('FROM family_notification_invitations'))return [[...(args[0]===familyContactHash(token)?[scope]:[])]];
    if(sql.includes('FROM client_guardians'))return [[...(recipient?[recipient]:[])]];
    if(sql.includes('FROM users'))return [[{email}]];
    if(sql.includes('FROM family_notification_choices'))return [[...(saved?[saved]:[])]];
    if(sql.includes('FROM school_session_email_preferences'))return [[...(school?[school]:[])]];
    return [{affectedRows:1}];
  }),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  db.getConnection=async()=>db;
});
it('opening a valid link exposes no account credentials and changes nothing',async()=>{
  expect((await familyNotificationInvitationContext(token,db)).revision).toBe(0);
  expect(db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  expect(db.commit).not.toHaveBeenCalled();
});
it.each(['forged','expired','revoked','changed email','no view'])('rejects a %s link without saving',async(kind)=>{
  let t=token;if(kind==='forged')t='b'.repeat(64);
  if(kind==='expired')scope.expires_at=new Date(0);
  if(kind==='revoked')recipient=null;
  if(kind==='changed email')recipient.email='another@example.test';
  if(kind==='no view')recipient.permissions_json={noView:true};
  await expect(familyNotificationInvitationContext(t,db)).rejects.toMatchObject({status:410});
});
it('requires complete choices and an explicit confirmation, never a GET preset',async()=>{
  for(const choices of [{},all('yes'),{...all('off'),marketing:'both'}])expect(()=>normalizeFamilyChoices(choices)).toThrow();
  await expect(saveFamilyNotificationChoices({token,input:{choices:select('both'),revision:0,version:FAMILY_CHOICE_VERSION}},db)).rejects.toThrow('confirm');
  expect(db.commit).not.toHaveBeenCalled();
});
it('saves a recipient/child/agency-specific preference and audit atomically without enrolling SMS or activating accounts',async()=>{
  await expect(saveFamilyNotificationChoices({token,input:{choices:select('both'),revision:0,version:FAMILY_CHOICE_VERSION,confirm:'yes',clientId:999,guardianUserId:999}},db)).resolves.toMatchObject({saved:true,textPreferencesPending:true});
  const writes=db.execute.mock.calls.filter(([sql])=>/^(INSERT|UPDATE)/.test(sql));
  expect(writes).toHaveLength(4);
  expect(writes[0][1].slice(0,3)).toEqual([2,22,50]);
  expect(writes.some(([sql])=>/sms_recipient_permissions|UPDATE users|password_hash/.test(sql))).toBe(false);
  expect(db.commit).toHaveBeenCalledOnce();expect(db.release).toHaveBeenCalledOnce();
});
it('rejects stale confirmations and rolls back failed audit persistence',async()=>{
  saved={choices_json:all('off'),revision:2};
  await expect(saveFamilyNotificationChoices({token,input:{choices:select('both'),revision:1,version:FAMILY_CHOICE_VERSION,confirm:'yes'}},db)).rejects.toMatchObject({status:409});
  expect(db.commit).not.toHaveBeenCalled();
  saved=null;const impl=db.execute.getMockImplementation();
  db.execute.mockImplementation((sql,args)=>sql.startsWith('INSERT INTO family_notification_choice_events')?Promise.reject(new Error('audit failed')):impl(sql,args));
  await expect(saveFamilyNotificationChoices({token,input:{choices:select('email'),revision:0,version:FAMILY_CHOICE_VERSION,confirm:'yes'}},db)).rejects.toThrow('audit failed');
  expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
});
it('reflects a later scoped school opt-out without changing other categories',async()=>{
  saved={choices_json:all('both'),revision:1};school={disabled_at:new Date()};
  const context=await familyNotificationInvitationContext(token,db);
  expect(context.choices.school_sessions).toBe('sms');expect(context.choices.appointments).toBe('both');
});
it.each(['email','sms'])('filters %s for the precise recipient, child and agency',async(channel)=>{
  saved={choices_json:{...all('both'),school_sessions:'off'}};
  const input={agencyId:2,clientId:22,to:channel==='sms'?'+17195550100':email,channel,templateType:'school_session_notice'};
  expect(await familyNotificationDeliveryGate(input,db)).toMatchObject({allowed:false});
  expect(await familyNotificationDeliveryGate({...input,templateType:'session_reminder'},db)).toEqual({allowed:true});
  const call=db.execute.mock.calls.find(([sql])=>sql.includes('FROM family_notification_choices'));
  expect(call[1]).toEqual([2,familyContactHash(input.to),22]);
  expect(call[0]).toContain(channel==='sms'?'phone_hash':'recipient_hash');
});
it('honors enrollment No and scheduling-only for the signer, never another guardian',async()=>{
  const input={agencyId:2,clientId:22,to:email,templateType:'family_balance_due'};
  m.intake.mockResolvedValue({emailPreference:'scheduling_only',recipientEmail:email});
  expect(await familyNotificationDeliveryGate(input,db)).toMatchObject({allowed:false,reason:'enrollment_email_choice_off'});
  expect(await familyNotificationDeliveryGate({...input,templateType:'session_reminder'},db)).toEqual({allowed:true});
  m.intake.mockResolvedValue({emailPreference:'no',recipientEmail:email});
  expect(await familyNotificationDeliveryGate({...input,templateType:'session_reminder'},db)).toMatchObject({allowed:false});
  expect(await familyNotificationDeliveryGate({...input,templateType:'family_notification_invitation'},db)).toMatchObject({allowed:false});
  expect(await familyNotificationDeliveryGate({...input,to:'other@example.test'},db)).toEqual({allowed:true});
  expect(await familyNotificationDeliveryGate({...input,templateType:'password_reset'},db)).toEqual({allowed:true});
});
it('new explicit choices supersede older email consent, while a later enrollment No is honored',async()=>{
  saved={choices_json:all('email'),updated_at:new Date('2026-10-20T10:00Z'),guardian_user_id:50};
  m.intake.mockResolvedValue({recipientEmail:email,emailPreference:'no',signedAt:'2026-10-19T10:00Z'});
  const input={agencyId:2,clientId:22,to:email,templateType:'family_balance_due'};
  expect(await familyNotificationDeliveryGate(input,db)).toEqual({allowed:true});
  expect(await latestFamilyEmailSchedulingChoice({...input,after:'2026-10-19T10:00Z'},db)).toEqual({email:true,guardianUserId:50});
  m.intake.mockResolvedValue({recipientEmail:email,emailPreference:'no',signedAt:'2026-10-21T10:00Z'});
  expect(await familyNotificationDeliveryGate(input,db)).toMatchObject({allowed:false});
});
it('does not issue invitations to a recipient who has explicitly declined emails',async()=>{
  const input={agencyId:2,clientId:22,guardianUserId:50,actorUserId:1};
  saved={choices_json:all('off')};await expect(createFamilyNotificationInvitation(input,db)).rejects.toMatchObject({status:409});
  saved=null;m.intake.mockResolvedValue({recipientEmail:email,emailPreference:'no'});
  await expect(createFamilyNotificationInvitation(input,db)).rejects.toMatchObject({status:409});
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});

it('proposes email defaults without recording consent and preserves the recipient’s enrollment declines',async()=>{
  const fresh=await familyNotificationInvitationContext(token,db);
  expect(fresh.choices.messages).toBe('email');expect(fresh.choices.documents).toBe('email');
  expect(fresh.choices.billing).toBe('email');expect(fresh.choices.insurance).toBe('email');
  expect(fresh.choices.enrollment).toBe('off');
  expect(Object.values(fresh.choices).some(value=>['both','sms'].includes(value))).toBe(false);
  m.intake.mockResolvedValue({recipientEmail:email,emailPreference:'no'});
  expect((await familyNotificationInvitationContext(token,db)).choices).toEqual(all('off'));
  m.intake.mockResolvedValue({recipientEmail:email,emailPreference:'scheduling_only'});
  const scheduling=await familyNotificationInvitationContext(token,db);
  expect(scheduling.choices.appointments).toBe('email');expect(scheduling.choices.school_sessions).toBe('email');
  expect(scheduling.choices.messages).toBe('off');expect(scheduling.choices.billing).toBe('off');
  expect(db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it.each(['sms','both'])('rejects insurance %s preferences and legacy SMS delivery',async(choice)=>{
  expect(()=>normalizeAccountUpdateChoices({...select('email'),insurance:choice})).toThrow('email only');
  saved={choices_json:all('both')};
  expect(await familyNotificationDeliveryGate({agencyId:2,clientId:22,to:'+17195550100',channel:'sms',notificationCategory:'insurance'},db))
    .toEqual({allowed:false,reason:'insurance_notifications_email_only'});
});
it.each(['school','office'])('maps one appointment choice to the actual %s enrollment without changing unfinished enrollment',async(clientType)=>{
  recipient.client_type=clientType;saved={choices_json:{...all('off'),enrollment:'sms'},revision:1};
  await saveFamilyNotificationChoices({token,input:{choices:select('email'),revision:1,version:FAMILY_CHOICE_VERSION,confirm:'yes'}},db);
  const call=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO family_notification_choices'));
  const stored=JSON.parse(call[1][5]);
  expect(stored.appointments).toBe('email');expect(stored.school_sessions).toBe(clientType==='school'?'email':'off');
  expect(stored.enrollment).toBe('sms');
  expect(db.execute.mock.calls.some(([sql])=>sql.includes('sms_recipient_permissions'))).toBe(false);
});
it('allows a preference invitation separately from unfinished enrollment but honors all-email opt-out',async()=>{
  saved={choices_json:{...all('off'),messages:'email'}};
  expect(await familyNotificationDeliveryGate({agencyId:2,clientId:22,to:email,templateType:'family_notification_invitation'},db)).toEqual({allowed:true});
  saved={choices_json:all('off')};
  expect(await familyNotificationDeliveryGate({agencyId:2,clientId:22,to:email,templateType:'family_notification_invitation'},db)).toMatchObject({allowed:false});
});

it('shows a newer enrollment email decline even when older saved preferences allowed emails',async()=>{
  saved={choices_json:all('both'),updated_at:new Date('2026-10-20T10:00Z'),revision:1};
  m.intake.mockResolvedValue({recipientEmail:email,emailPreference:'no',signedAt:'2026-10-21T10:00Z'});
  const context=await familyNotificationInvitationContext(token,db);
  expect(Object.values(context.choices).every(choice=>choice==='sms')).toBe(true);
});

it('applies billing choices to automatic benefits-update notices',async()=>{
  saved={choices_json:{...all('email'),billing:'off'}};
  expect(await familyNotificationDeliveryGate({agencyId:2,clientId:22,to:email,templateType:'family_benefits_update'},db)).toMatchObject({allowed:false,reason:'family_notification_category_off'});
});

it.each(['portal_migration_invite','trigger:portal_migration_invite'])('gates %s separately from unfinished forms while honoring explicit restrictions',async(templateType)=>{
  const input={agencyId:2,clientId:22,to:email,templateType};
  expect(await familyNotificationDeliveryGate(input,db)).toEqual({allowed:true});
  saved={choices_json:{...all('off'),messages:'email'},updated_at:new Date('2026-10-20T10:00Z')};
  expect(await familyNotificationDeliveryGate(input,db)).toEqual({allowed:true});
  saved={choices_json:all('off')};
  expect(await familyNotificationDeliveryGate(input,db)).toMatchObject({allowed:false});
  saved=null;
  for(const emailPreference of ['no','scheduling_only']){
    m.intake.mockResolvedValue({emailPreference,recipientEmail:email});
    expect(await familyNotificationDeliveryGate(input,db)).toMatchObject({allowed:false,reason:'enrollment_email_choice_off'});
  }
  expect(await familyNotificationDeliveryGate({...input,templateType:'password_reset'},db)).toEqual({allowed:true});
  expect(await familyNotificationDeliveryGate({...input,templateType:'guardian_portal_login_info'},db)).toEqual({allowed:true});
});
it('respects billing preferences for generated cost estimates and does not affect document choices',async()=>{
  const input={agencyId:2,clientId:22,to:email,templateType:'family_cost_estimate'};
  saved={choices_json:{...all('email'),billing:'off'}};
  expect(await familyNotificationDeliveryGate(input,db)).toMatchObject({allowed:false});
  expect(await familyNotificationDeliveryGate({...input,templateType:'guardian_plan_review'},db)).toEqual({allowed:true});
});

it('lets an authenticated account manage its scoped preferences after declining optional invitations without changing them',async()=>{
 saved={choices_json:all('off')};m.intake.mockResolvedValue({emailPreference:'no',email});
 const result=await createFamilyNotificationInvitation({agencyId:2,clientId:22,guardianUserId:50,actorUserId:50,forAccountSettings:true},db);
 expect(result.url).toContain('notification');
 expect(db.execute.mock.calls.some(([sql])=>/UPDATE family_notification_choices|INSERT INTO family_notification_choices/.test(sql))).toBe(false);
});
