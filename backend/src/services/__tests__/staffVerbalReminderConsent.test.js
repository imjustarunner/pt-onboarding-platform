import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../clientAccountSupportAccess.service.js',()=>({requireClientAccountSupport:vi.fn()}));
vi.mock('../guardianAppointments.service.js',()=>({authorizedAppointmentClient:vi.fn()}));
vi.mock('../smsCompliance.service.js',()=>({getSmsSender:vi.fn(),resolveRegisteredSmsSender:vi.fn(),isSmsSuppressed:vi.fn()}));
vi.mock('../intakeCommunicationChoices.service.js',()=>({latestIntakeCommunicationChoices:vi.fn(async()=>null)}));
import pool from '../../config/database.js';
import {requireClientAccountSupport} from '../clientAccountSupportAccess.service.js';
import {authorizedAppointmentClient} from '../guardianAppointments.service.js';
import {getSmsSender,resolveRegisteredSmsSender,isSmsSuppressed} from '../smsCompliance.service.js';
import {latestIntakeCommunicationChoices} from '../intakeCommunicationChoices.service.js';
import {recordStaffVerbalReminderConsent,staffReminderConsentContext,reviewedVerbalReminderGrant} from '../staffVerbalReminderConsent.service.js';
import {verbalReminderDisclosure,VERBAL_REMINDER_CONSENT_VERSION} from '../../utils/staffVerbalReminderConsent.js';
const user={id:19,role:'support'},client={id:101,agency_id:2,client_type:'school'};
const agency={id:2,name:'Practice'},guardian={id:55,first_name:'Parent',last_name:'QA',email:'parent@example.com',phone:'+13035550100',relationship_type:'guardian'};
const registration={provider:'notifyre',brandId:'brand',campaignId:'campaign',brandName:'Practice',verbalReminderConsentApproved:true,verbalReminderConsentVersion:VERBAL_REMINDER_CONSENT_VERSION,legalName:'Practice LLC',resellerId:'r',supportContact:'support@example.com',website:'https://example.com',privacyUrl:'https://example.com/privacy',termsUrl:'https://example.com/terms',evidenceUrl:'https://example.com/consent',purposes:['reminders'],keywordOwner:'notifyre',approved:true,numberLinked:true};
const sender={id:3,agency_id:2,scope:'campaign:campaign',phone_number:'+13035550101',registration};
let db,events,permission,sends,input,recipientRows;
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('NOTIFYRE_CLIENT_CAMPAIGNS_JSON',JSON.stringify({'2':{brandId:'brand',campaignId:'campaign'}}));
 requireClientAccountSupport.mockResolvedValue(client);authorizedAppointmentClient.mockResolvedValue(client);resolveRegisteredSmsSender.mockResolvedValue(sender.phone_number);getSmsSender.mockResolvedValue(sender);isSmsSuppressed.mockResolvedValue(false);latestIntakeCommunicationChoices.mockResolvedValue(null);
 events=[];permission=null;recipientRows=[guardian];sends=vi.fn(async()=>({sid:'carrier-id'}));
 input={recipientId:55,phone:guardian.phone,method:'phone',collectedAt:new Date(Date.now()-60000).toISOString(),attested:true,authorityConfirmed:true,phoneConfirmed:true,version:VERBAL_REMINDER_CONSENT_VERSION,disclosure:verbalReminderDisclosure(agency,registration),requestKey:'9c80eaa0-9019-4882-8a76-0e5561640905'};
 const execute=vi.fn(async(sql,args=[])=>{
  if(sql.includes('SELECT id,name,official_name'))return [[agency]];
  if(sql.includes('FROM client_guardians cg'))return [recipientRows];
  if(sql.includes('SELECT full_name'))return [[{full_name:'Child QA',date_of_birth:'2015-01-01',status:'ACTIVE'}]];
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('SELECT id,evidence_json FROM sms_permission_events'))return [events.filter(e=>e.scope_key===args[0]&&e.provider_message_id===args[1])];
  if(sql.includes('SELECT id,evidence_json,created_at'))return [events.filter(e=>e.scope_key===args[0]).slice(-1)];
  if(sql.includes('SELECT evidence_json FROM sms_permission_events'))return [events.filter(e=>e.id===args[0]&&e.scope_key===args[1]&&e.phone===args[2])];
  if(sql.startsWith('INSERT INTO sms_permission_events')){const row={id:events.length+1,scope_key:args[0],phone:args[1],evidence_json:JSON.parse(args[2]),provider_message_id:args[3]};events.push(row);return [{insertId:row.id}];}
  if(sql.includes('SELECT evidence_json FROM sms_recipient_permissions'))return [permission?[{evidence_json:permission}]:[]];
  if(sql.startsWith('INSERT INTO sms_recipient_permissions')){permission=JSON.parse(args[2]);return [{affectedRows:1}];}
  if(sql.includes('SELECT channels_json'))return [[{channels_json:{email:false,in_app:true,sms:false}}]];
  if(sql.includes('SELECT choices_json,revision'))return [[{choices_json:{appointments:'off',school_sessions:'off',schedule_changes:'email',messages:'off',documents:'email',billing:'off'},revision:3}]];
  return [{affectedRows:1}];
 });
 db={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.execute.mockImplementation(execute);pool.getConnection.mockResolvedValue(db);
});
const save=()=>recordStaffVerbalReminderConsent({user,clientId:101,input,sendConfirmation:sends});
it('records the named staff attestation and enables only the selected recipient, preserving email choices',async()=>{
 const result=await save();expect(result).toMatchObject({recorded:true,activated:true,confirmation:'accepted'});expect(db.commit).toHaveBeenCalledOnce();
 const evidence=events[0].evidence_json;expect(evidence).toMatchObject({source:'staff_verbal_attestation',clientId:101,recipientUserId:55,actorUserId:19,attested:true});expect(evidence).not.toHaveProperty('signatureReference');
 expect(permission.grants).toHaveLength(1);expect(permission.grants[0]).toMatchObject({recipientUserId:55,clientId:101,consentEventId:1});
 const prefs=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO client_session_notification_preferences'));expect(prefs[1].slice(0,3)).toEqual([2,101,55]);expect(JSON.parse(prefs[1][3])).toMatchObject({email:false,sms:true});
 const family=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO family_notification_choices'));const choices=JSON.parse(family[1][5]);expect(choices).toMatchObject({appointments:'sms',schedule_changes:'both',messages:'off',billing:'off',documents:'email'});
 expect(sends).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:101,purpose:'reminders',to:guardian.phone}));
});
it('records pending evidence without enabling preferences or sending when the campaign is unavailable',async()=>{
 resolveRegisteredSmsSender.mockResolvedValue(null);input.disclosure=verbalReminderDisclosure(agency);
 expect(await save()).toMatchObject({recorded:true,activated:false,pendingReason:expect.any(String)});expect(permission).toBeNull();expect(sends).not.toHaveBeenCalled();
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO client_session_notification_preferences'))).toBe(false);
});
it('keeps consent pending until the registered verbal script is approved',async()=>{
 getSmsSender.mockResolvedValue({...sender,registration:{...registration,verbalReminderConsentApproved:false}});
 expect(await save()).toMatchObject({activated:false,pendingReason:expect.stringContaining('carrier approved')});expect(permission).toBeNull();
});
it('never clears STOP or creates grants after a STOP',async()=>{
 isSmsSuppressed.mockResolvedValue(true);await expect(save()).rejects.toThrow('STOP');expect(events).toHaveLength(0);expect(permission).toBeNull();expect(sends).not.toHaveBeenCalled();
});
it.each([{attested:false},{authorityConfirmed:false},{phoneConfirmed:false},{phone:'+13035550199'},{recipientId:999},{version:'old'},{disclosure:'Changed script'},{method:'email'},{collectedAt:'2099-01-01T00:00:00Z'}])('rejects incomplete or stale consent %j',async patch=>{Object.assign(input,patch);await expect(save()).rejects.toThrow();expect(events).toHaveLength(0);});
it('does not record consent for a revoked relationship or impersonated staff account',async()=>{
 authorizedAppointmentClient.mockRejectedValue(Object.assign(Error('No access'),{status:403}));await expect(save()).rejects.toThrow('eligible');
 await expect(recordStaffVerbalReminderConsent({user:{...user,switchedFromUserId:3},clientId:101,input,sendConfirmation:sends})).rejects.toMatchObject({status:403});
});
it('requires support access before reading any contacts or writing consent',async()=>{
 requireClientAccountSupport.mockRejectedValue(Object.assign(Error('Access denied'),{status:403}));
 await expect(save()).rejects.toMatchObject({status:403});await expect(staffReminderConsentContext({id:2,role:'school_staff'},101)).rejects.toMatchObject({status:403});expect(pool.getConnection).not.toHaveBeenCalled();
});
it('deduplicates an HTTP retry and does not send a second confirmation',async()=>{
 await save();expect(await save()).toMatchObject({duplicate:true,activated:false});expect(events).toHaveLength(2);expect(sends).toHaveBeenCalledOnce();
});
it('rejects a consent older than the recipient’s newer decline',async()=>{
 latestIntakeCommunicationChoices.mockResolvedValue({smsPreference:'no',signedAt:new Date().toISOString()});await expect(save()).rejects.toThrow('declined texts after');expect(events).toHaveLength(0);
});
it('a failed confirmation is reported for review without claiming delivery or resending on retry',async()=>{
 sends.mockRejectedValue(Error('Timeout'));expect(await save()).toMatchObject({activated:true,confirmation:'review'});expect(await save()).toMatchObject({duplicate:true});expect(sends).toHaveBeenCalledOnce();
});
it('rechecks exact client, recipient and current phone at delivery, and preserves grants for siblings',async()=>{
 await save();expect(await reviewedVerbalReminderGrant({evidence:permission,agencyId:2,clientId:101,phone:guardian.phone,recipientUserId:55})).toMatchObject({source:'staff_verbal',reference:'sms_permission_events:1'});
 expect(await reviewedVerbalReminderGrant({evidence:permission,agencyId:2,clientId:102,phone:guardian.phone})).toBeNull();
 expect(await reviewedVerbalReminderGrant({evidence:permission,agencyId:3,clientId:101,phone:guardian.phone})).toBeNull();
 recipientRows=[{...guardian,phone:'+13035550199'}];expect(await reviewedVerbalReminderGrant({evidence:permission,agencyId:2,clientId:101,phone:guardian.phone})).toBeNull();
});
it('rolls back consent and preferences if the audit write fails',async()=>{
 const impl=db.execute.getMockImplementation();db.execute.mockImplementation((sql,...args)=>sql.startsWith('INSERT INTO user_activity_log')?Promise.reject(Error('Audit unavailable')):impl(sql,...args));
 await expect(save()).rejects.toThrow('Audit unavailable');expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(sends).not.toHaveBeenCalled();
});
it('supports an adult client’s saved contact phone without creating a portal account',async()=>{
 recipientRows=[];input.recipientId='client';input.phone='+13035550120';
 const original=db.execute.getMockImplementation();db.execute.mockImplementation((sql,...args)=>sql.includes('SELECT full_name')?Promise.resolve([[{full_name:'Adult QA',date_of_birth:'1985-01-01',contact_phone:input.phone,email:'adult@example.com',status:'ACTIVE'}]]):original(sql,...args));
 expect(await save()).toMatchObject({activated:true});expect(permission.grants[0].recipientUserId).toBe(0);
 expect(db.execute).toHaveBeenCalledWith('UPDATE clients SET session_sms_opt_in=1 WHERE id=? AND agency_id=?',[101,2]);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO users'))).toBe(false);
});
it('preserves a parent’s separately recorded grants for two clients sharing the same phone',async()=>{
 await save();requireClientAccountSupport.mockResolvedValue({...client,id:102});input.requestKey='8c80eaa0-9019-4882-8a76-0e5561640905';
 await save();expect(permission.grants.map(g=>g.clientId)).toEqual([101,102]);
});
it('retains earlier signed reminder evidence for existing recipients while recording the new scoped verbal grant',async()=>{
 permission={source:'web_form',signerVerified:true,signatureReference:'signed:12',collectedAt:'2026-01-01T12:00:00Z'};
 await save();expect(permission.previousSignedConsent).toMatchObject({signatureReference:'signed:12'});
});
