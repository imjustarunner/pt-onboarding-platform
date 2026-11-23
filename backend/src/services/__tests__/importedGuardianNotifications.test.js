import {beforeEach,expect,it,vi} from 'vitest';
const currentIntake=vi.hoisted(()=>vi.fn());
vi.mock('../intakeCommunicationChoices.service.js',()=>({latestIntakeCommunicationChoices:currentIntake}));
import {createHash} from 'node:crypto';
import {seedImportedGuardianNotifications,activateImportedGuardianNotifications,importedReminderChannels,importedGuardianSmsAllowed} from '../importedGuardianNotifications.service.js';
import {contactReminderPhoneHash} from '../../utils/contactReminderConsent.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
let db,connection,row,permissions,sms,send,prefsInserted;
beforeEach(()=>{
 currentIntake.mockReset().mockResolvedValue(null);
 prefsInserted=1;permissions=[];
 row={id:71,agency_id:2,client_id:12,guardian_user_id:40,affiliation_id:51,email:'second@example.test',email_hash:hash('second@example.test'),phone:'+17205550102',phone_hash:contactReminderPhoneHash('720-555-0102'),email_enabled:1,sms_enabled:1,source_reminders:'Text (SMS) and Email',recorded_by_user_id:10,role:'client_guardian',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,access_enabled:1,permissions_json:{},client_status:'ACTIVE',client_status_key:'current',channels_json:{email:true,sms:true},provider_pushed_updates_enabled:1,activation_status:'pending_portal',created_at:'2026-01-01T12:00:00Z'};
 connection={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql)=>sql.includes('GET_LOCK')?[[{locked:1}]]:sql.includes('INSERT IGNORE INTO client_session_notification_preferences')?[{affectedRows:prefsInserted}]:[{}])};
 db={getConnection:vi.fn(async()=>connection),execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT id,activation_status'))return [[]];
  if(sql.startsWith('SELECT id,agency_id'))return row.activation_status==='pending_portal'?[[{id:row.id,agency_id:2}]]:[[]];
  if(sql.startsWith('SELECT n.*'))return [[row]];
  if(sql.startsWith('SELECT purpose,status'))return [permissions.map(p=>({...p}))];
  if(sql.startsWith('SELECT activation_status'))return [[{activation_status:row.activation_status}]];
  if(sql.startsWith('SELECT confirmation_message_id'))return [[]];
  if(sql.includes("SET activation_status='confirming'"))row.activation_status='confirming';
  if(sql.includes("SET activation_status='active'")){row.activation_status='active';row.confirmation_message_id=args[0];}
  if(sql.includes("SET activation_status='superseded'"))row.activation_status='superseded';
  if(sql.includes("SET activation_status='failed'"))row.activation_status='failed';
  return [{affectedRows:1}];
 })};
 sms={resolveRegisteredSmsSender:vi.fn(async()=>'+17195550100'),getSmsSender:vi.fn(async()=>({phone_number:'+17195550100',agency_id:2,scope:'agency:2',registration:{provider:'notifyre',brandId:'b',campaignId:'c',resellerId:'r',brandName:'Example Agency',legalName:'Example Agency LLC',supportContact:'support@example.test',website:'https://example.test',privacyUrl:'https://example.test/privacy',termsUrl:'https://example.test/terms',evidenceUrl:'https://example.test/consent',purposes:['reminders','care'],keywordOwner:'notifyre',approved:true,numberLinked:true}})),isSmsSuppressed:vi.fn(async()=>false),recordSmsPermission:vi.fn(async p=>{const found=permissions.find(v=>v.purpose===p.purpose);if(found)Object.assign(found,{status:p.status,evidence_json:p.evidence});else permissions.push({purpose:p.purpose,status:p.status,evidence_json:p.evidence});return true;})};
 send=vi.fn(async()=>({sid:'notifyre:confirmation'}));
});
const activate=()=>activateImportedGuardianNotifications(40,{db,sms,send,locale:async()=>'en'});
it.each([['Text (SMS) and Email',{email:true,sms:true}],['Email',{email:true,sms:false}],['Text (SMS)',{email:false,sms:true}],['No Reminders',{email:false,sms:false}],['',null],['Unknown',null],['Texto y correo electrónico',{email:true,sms:true}]])('reads only the explicit copied choice %s',(value,expected)=>expect(importedReminderChannels(value)).toEqual(expected));
it('seeds distinct guardian preferences without sending anything at import',async()=>{
 const result=await seedImportedGuardianNotifications({agencyId:2,clientId:12,guardianUserId:40,affiliationId:51,contact:{email:row.email,mobilePhone:row.phone,appointmentReminders:row.source_reminders},actorUserId:10},db);
 expect(result).toMatchObject({status:'pending_portal',channels:{email:true,sms:true},source:'prior_ehr_contact'});
 expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO client_session_notification_preferences'),[2,12,40,JSON.stringify({in_app:true,phone:false,email:true,sms:true})]);
 expect(connection.execute.mock.calls.find(([sql])=>sql.includes('INSERT IGNORE INTO imported_guardian_notification_choices'))[1]).toContain(10);
 expect(send).not.toHaveBeenCalled();expect(sms.recordSmsPermission).not.toHaveBeenCalled();
});
it('preserves an existing app preference instead of replacing it with an old EHR choice',async()=>{
 prefsInserted=0;
 const result=await seedImportedGuardianNotifications({agencyId:2,clientId:12,guardianUserId:40,affiliationId:51,contact:{email:row.email,mobilePhone:row.phone,appointmentReminders:row.source_reminders},actorUserId:10},db);
 expect(result.status).toBe('superseded');expect(connection.commit).toHaveBeenCalledOnce();
});
it('activates reminders and provider texts with one confirmation after portal entry, once',async()=>{
 await activate();expect(row.activation_status).toBe('active');expect(send).toHaveBeenCalledOnce();
 expect(sms.recordSmsPermission.mock.calls.map(([p])=>p.purpose)).toEqual(['reminders','care']);
 expect(send).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:12,recipientUserId:40,confirmationPurposes:['reminders','care'],body:expect.stringMatching(/NOREMIND.*NOPROVIDER.*STOP.*HELP/)}));
 const evidence=sms.recordSmsPermission.mock.calls[0][0].evidence;
 expect(evidence).toMatchObject({source:'prior_ehr_contact',importedByUserId:10,actor:{kind:'automation',source:'guardian_portal_import_activation'},sourceReminders:row.source_reminders});expect(evidence).not.toHaveProperty('signatureReference');
 expect(await importedGuardianSmsAllowed({evidence,agencyId:2,clientId:12,recipientUserId:40,phone:row.phone},db)).toBe(true);
 expect(await importedGuardianSmsAllowed({evidence,agencyId:2,clientId:13,recipientUserId:40,phone:row.phone},db)).toBe(false);
 expect(await importedGuardianSmsAllowed({evidence,agencyId:2,clientId:12,recipientUserId:41,phone:row.phone},db)).toBe(false);
 row.provider_pushed_updates_enabled=0;expect(await importedGuardianSmsAllowed({evidence,agencyId:2,clientId:12,recipientUserId:40,phone:row.phone,purpose:'care'},db)).toBe(false);
 expect(await importedGuardianSmsAllowed({evidence,agencyId:2,clientId:12,recipientUserId:40,phone:row.phone,purpose:'reminders'},db)).toBe(true);
 row.provider_pushed_updates_enabled=1;row.permissions_json={canMessage:false};expect(await importedGuardianSmsAllowed({evidence,agencyId:2,clientId:12,recipientUserId:40,phone:row.phone,purpose:'care'},db)).toBe(false);
 await activate();expect(send).toHaveBeenCalledOnce();
});
it('keeps STOP and category opt-outs in force',async()=>{
 sms.isSmsSuppressed.mockResolvedValue(true);await activate();expect(send).not.toHaveBeenCalled();expect(sms.recordSmsPermission).not.toHaveBeenCalled();
 sms.isSmsSuppressed.mockResolvedValue(false);permissions=[{purpose:'reminders',status:'opted_out',evidence_json:{source:'inbound_noremind'}}];
 await activate();expect(send).toHaveBeenCalledWith(expect.objectContaining({confirmationPurposes:['care'],body:expect.stringContaining('provider messages')}));expect(sms.recordSmsPermission.mock.calls.map(([p])=>p.purpose)).toEqual(['care']);
 expect(permissions.find(p=>p.purpose==='reminders').status).toBe('opted_out');
});
it('waits for a ready sender without changing consent or sending a message',async()=>{
 const sender=await sms.getSmsSender();sender.registration.approved=false;sms.getSmsSender.mockResolvedValue(sender);
 expect(await activate()).toEqual([{id:71,status:'sender_not_ready'}]);expect(row.activation_status).toBe('pending_portal');expect(send).not.toHaveBeenCalled();expect(sms.recordSmsPermission).not.toHaveBeenCalled();
});
it('preserves current signed communication choices over older imported preferences',async()=>{
 currentIntake.mockResolvedValue({signatureAccepted:true,smsPreference:'no',providerTextingOptIn:'no'});
 const seeded=await seedImportedGuardianNotifications({agencyId:2,clientId:12,guardianUserId:40,affiliationId:51,contact:{email:row.email,mobilePhone:row.phone,appointmentReminders:row.source_reminders},actorUserId:10},db);
 expect(seeded.status).toBe('superseded');expect(connection.beginTransaction).not.toHaveBeenCalled();
 await activate();expect(send).not.toHaveBeenCalled();expect(sms.recordSmsPermission).not.toHaveBeenCalled();
});
it.each(['access','phone','email','billing','revoked','pending','app-off'])('does not activate after %s changes',async change=>{
 if(change==='access')row.access_enabled=0;
 if(change==='phone')row.phone='+17205550199';
 if(change==='email')row.email='different@example.test';
 if(change==='billing')row.permissions_json={billingOnly:true};
 if(change==='revoked')row.permissions_json={relationshipRevoked:true};
 if(change==='pending')row.permissions_json={pendingGuardianVerification:true};
 if(change==='app-off')row.channels_json={sms:false};
 await activate();expect(send).not.toHaveBeenCalled();expect(sms.recordSmsPermission).not.toHaveBeenCalled();
});
it('restores permissions if the confirmation fails, and keeps the portal usable',async()=>{
 send.mockRejectedValue(Object.assign(new Error('Unavailable'),{code:'carrier_unavailable'}));
 expect(await activate()).toEqual([{id:71,status:'failed'}]);expect(row.activation_status).toBe('failed');expect(permissions.every(p=>p.status==='opted_out')).toBe(true);expect(connection.release).toHaveBeenCalledOnce();
});
it('does not send another confirmation when the same parent adds a sibling',async()=>{
 permissions=['reminders','care'].map(purpose=>({purpose,status:'opted_in',evidence_json:{source:'prior_ehr_contact',grants:[{importId:70,agencyId:2,clientId:11,guardianUserId:40}]}}));
 const execute=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT confirmation_message_id')?[[{confirmation_message_id:'notifyre:earlier'}]]:execute(sql,...args));
 await activate();expect(send).not.toHaveBeenCalled();expect(row.activation_status).toBe('active');expect(permissions[0].evidence_json.grants).toHaveLength(2);
});
it('provides the confirmation and opt-out instructions in Spanish',async()=>{
 await activateImportedGuardianNotifications(40,{db,sms,send,locale:async()=>'es'});expect(send).toHaveBeenCalledWith(expect.objectContaining({body:expect.stringMatching(/Su portal está listo.*NOREMIND.*NOPROVIDER.*STOP/)}));
});
