import crypto from 'node:crypto';
import pool from '../config/database.js';
import { requireClientAccountSupport } from './clientAccountSupportAccess.service.js';
import { authorizedAppointmentClient } from './guardianAppointments.service.js';
import { ageOn } from './guardianClinicalAccess.service.js';
import { getSmsSender, resolveRegisteredSmsSender, isSmsSuppressed } from './smsCompliance.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { contactReminderConsentLock, contactReminderPhoneHash } from '../utils/contactReminderConsent.js';
import { VERBAL_REMINDER_CONSENT_VERSION, verbalReminderProgramReady, verbalReminderDisclosure } from '../utils/staffVerbalReminderConsent.js';
import { validateSmsRegistration } from '../utils/smsCompliancePolicy.js';
import { smsTransport } from './notifyre.service.js';
import { latestIntakeCommunicationChoices } from './intakeCommunicationChoices.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const recipientId = value => value === 'client' ? 0 : Number(value);
const eventScope = agencyId => `agency:${agencyId}:verbal-reminders`;
const hash = value => crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');

async function recipients(client, db = pool) {
  const [rows] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.email,
    COALESCE(NULLIF(u.phone_number,''),NULLIF(u.personal_phone,''),u.work_phone) phone,cg.relationship_type
    FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
    WHERE cg.client_id=? AND cg.access_enabled=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())`,[client.id]);
  const result=[];
  for(const row of rows){
    try { await authorizedAppointmentClient(row.id,client.id,{agencyId:client.agency_id}); }
    catch(error){if([403,404].includes(error.status))continue;throw error;}
    result.push({id:Number(row.id),name:[row.first_name,row.last_name].filter(Boolean).join(' ')||'Account holder',email:row.email,phone:normalizeSmsPhone(row.phone),relationship:row.relationship_type});
  }
  const [[person]]=await db.execute('SELECT full_name,date_of_birth,contact_phone,email,status FROM clients WHERE id=? AND agency_id=?',[client.id,client.agency_id]);
  if(person?.status==='ARCHIVED')return [];
  if(person && ageOn(person.date_of_birth)>=18 && !rows.some(row=>row.relationship_type==='self'))
    result.push({id:0,name:person.full_name||'Adult client',email:person.email,phone:normalizeSmsPhone(person.contact_phone),relationship:'self'});
  return result;
}
async function program(agencyId){
  const [[agency]]=await pool.execute('SELECT id,name,official_name FROM agencies WHERE id=?',[agencyId]);
  const from=await resolveRegisteredSmsSender({agencyId,purpose:'reminders'});
  const sender=from?await getSmsSender(from):null;
  const registration=sender?.registration;
  let reason=null;
  if(!sender || validateSmsRegistration(registration).length)reason='The agency’s appointment-text sender is not ready. Consent can be recorded; texts remain off.';
  else if(!verbalReminderProgramReady(registration))reason='An administrator must confirm that the carrier approved this verbal reminder opt-in script before activation.';
  if(!reason){
    try { smsTransport({registration,agencyId,purpose:'reminders'}); }
    catch(error){
      if(!['notifyre_not_ready','notifyre_agency_campaign_mismatch','notifyre_campaign_configuration_invalid'].includes(error.code))throw error;
      reason='The agency’s clinical texting service is awaiting activation. An administrator must finish texting setup; consent can be recorded, but texts remain off.';
    }
  }
  return {sender,reason,disclosure:verbalReminderDisclosure(agency,registration),version:VERBAL_REMINDER_CONSENT_VERSION};
}
export async function staffReminderConsentContext(user,clientId){
  const client=await requireClientAccountSupport(user,clientId);
  const p=await program(client.agency_id),people=await recipients(client);
  for(const person of people){
    person.stopped=!!(person.phone&&p.sender&&await isSmsSuppressed(p.sender,person.phone));
    const [[latest]]=await pool.execute(`SELECT id,evidence_json,created_at FROM sms_permission_events
      WHERE scope_key=? AND purpose='reminders' AND phone=?
      AND JSON_EXTRACT(evidence_json,'$.clientId')=? AND JSON_EXTRACT(evidence_json,'$.recipientUserId')=?
      AND JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.source'))='staff_verbal_attestation'
      ORDER BY id DESC LIMIT 1`,[eventScope(client.agency_id),person.phone||'',client.id,person.id]);
    person.lastConsent=latest?{id:latest.id,collectedAt:parse(latest.evidence_json).collectedAt,actorUserId:parse(latest.evidence_json).actorUserId}:null;
    const [[permission]]=p.sender&&person.phone?await pool.execute("SELECT evidence_json FROM sms_recipient_permissions WHERE scope_key=? AND phone=? AND purpose='reminders' AND status='opted_in' AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())",[p.sender.scope,person.phone]):[[]];
    const grants=parse(permission?.evidence_json).grants||[];
    person.enabled=!person.stopped&&!p.reason&&grants.some(g=>Number(g.clientId)===Number(client.id)&&g.recipientUserId===person.id);
  }
  return {agencyId:client.agency_id,recipients:people,disclosure:p.disclosure,version:p.version,activationBlocked:p.reason};
}

// This is consent evidence from a named staff attestation, never a fabricated
// recipient signature. Its immutable event and preference/permission writes
// commit together. The shared Notifyre lock serializes it with START/STOP.
export async function recordStaffVerbalReminderConsent({user,clientId,input,sendConfirmation}){
  if(user?.demoMode||user?.switchedFromUserId)throw fail('Use your own authorized staff account to attest to consent.',403);
  const client=await requireClientAccountSupport(user,clientId),p=await program(client.agency_id);
  const selected=recipientId(input.recipientId),person=(await recipients(client)).find(r=>r.id===selected);
  if(!person?.phone)throw fail('Choose a current eligible client or guardian with a saved phone number.');
  if(normalizeSmsPhone(input.phone)!==person.phone)throw fail('The phone number changed. Reload and verify it with the recipient.',409);
  if(input.attested!==true || input.authorityConfirmed!==true || input.phoneConfirmed!==true)throw fail('Confirm the recipient’s verbal agreement, authority and control of this exact phone.');
  if(input.version!==p.version || input.disclosure!==p.disclosure)throw fail('The disclosure changed. Reload and read the current script.',409);
  if(!['phone','in_person'].includes(input.method))throw fail('Choose phone call or in person.');
  if(!/^[a-f0-9-]{36}$/i.test(input.requestKey||''))throw fail('Reload before recording this consent.');
  const collected=new Date(input.collectedAt);
  if(!Number.isFinite(+collected)||+collected>Date.now()||+collected<Date.now()-7*86400000)throw fail('Record the actual consent time within the last seven days. Older evidence needs review.');
  const intake=await latestIntakeCommunicationChoices(client.id,client.agency_id,person.id||null);
  if(intake?.smsPreference==='no'&&Date.parse(intake.signedAt||intake.submittedAt)>=+collected)throw fail('The recipient declined texts after this consent. Obtain a new verbal agreement.',409);
  const db=await pool.getConnection();let locked=false;
  const lock=p.sender?contactReminderConsentLock(p.sender,person.phone):`verbal-reminders:${client.agency_id}:${contactReminderPhoneHash(person.phone).slice(0,32)}`;
  let eventId,activated=false,duplicate=false;
  try{
    const [[acquired]]=await db.execute('SELECT GET_LOCK(?,5) acquired',[lock]);if(!Number(acquired?.acquired))throw fail('Consent is being updated. Please retry.',409);locked=true;
    const freshPerson=(await recipients(client,db)).find(r=>r.id===person.id&&r.phone===person.phone);
    if(!freshPerson)throw fail('This contact or their appointment access changed. Reload.',409);
    if(p.sender&&await isSmsSuppressed(p.sender,person.phone))throw fail('This number selected STOP. Staff cannot clear it; the recipient must restart through the registered program.',409);
    await db.beginTransaction();
    const [[prior]]=await db.execute('SELECT id,evidence_json FROM sms_permission_events WHERE scope_key=? AND provider_message_id=?',[eventScope(client.agency_id),`verbal:${input.requestKey}`]);
    const evidence={source:'staff_verbal_attestation',version:p.version,clientId:Number(client.id),recipientUserId:person.id,phoneHash:contactReminderPhoneHash(person.phone),actorUserId:Number(user.id),attested:true,authorityConfirmed:true,phoneConfirmed:true,method:input.method,collectedAt:collected.toISOString(),recordedAt:new Date().toISOString(),disclosure:p.disclosure};
    if(prior){
      const old=parse(prior.evidence_json);
      if(old.clientId!==evidence.clientId||old.recipientUserId!==person.id||old.phoneHash!==evidence.phoneHash||old.disclosure!==evidence.disclosure||old.collectedAt!==evidence.collectedAt||old.method!==evidence.method)throw fail('This consent request belongs to a different contact. Reload.',409);
      eventId=prior.id;Object.assign(evidence,old);duplicate=true;
    }else{
      const [saved]=await db.execute(`INSERT INTO sms_permission_events (scope_key,phone,purpose,status,evidence_json,provider_message_id) VALUES (?,?,'reminders','pending',?,?)`,[eventScope(client.agency_id),person.phone,JSON.stringify(evidence),`verbal:${input.requestKey}`]);eventId=saved.insertId;
    }
    if(!p.reason){
      const [[current]]=await db.execute("SELECT evidence_json FROM sms_recipient_permissions WHERE scope_key=? AND phone=? AND purpose='reminders' FOR UPDATE",[p.sender.scope,person.phone]);
      const priorEvidence=parse(current?.evidence_json);
      const grants=priorEvidence.source==='staff_verbal'?priorEvidence.grants||[]:[];
      activated=!grants.some(g=>g.consentEventId===eventId);
      if(activated){
        const retained=grants.filter(g=>g.clientId!==Number(client.id)||g.recipientUserId!==person.id);
        retained.push({clientId:Number(client.id),recipientUserId:person.id,consentEventId:eventId,collectedAt:evidence.collectedAt,actorUserId:evidence.actorUserId});
        const previousSignedConsent=priorEvidence.source==='staff_verbal'?priorEvidence.previousSignedConsent:priorEvidence.signerVerified===true&&priorEvidence.signatureReference?priorEvidence:null;
        const permission={source:'staff_verbal',version:p.version,grants:retained,...(previousSignedConsent?{previousSignedConsent}: {})};
        await db.execute(`INSERT INTO sms_recipient_permissions (scope_key,phone,purpose,status,evidence_json) VALUES (?,?,'reminders','opted_in',?) ON DUPLICATE KEY UPDATE status='opted_in',evidence_json=VALUES(evidence_json),expires_at=NULL`,[p.sender.scope,person.phone,JSON.stringify(permission)]);
        await db.execute(`INSERT INTO sms_permission_events (scope_key,phone,purpose,status,evidence_json,provider_message_id) VALUES (?,?,'reminders','opted_in',?,?)`,[p.sender.scope,person.phone,JSON.stringify(permission),`verbal-activate:${eventId}`]);
        await enableReminderPreferences(db,client,person);
      }
    }
    await db.execute('INSERT INTO user_activity_log (action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',['staff_record_verbal_reminder_consent',user.id,client.agency_id,JSON.stringify({clientId:Number(client.id),targetUserId:person.id||null,consentEventId:eventId,phoneLastFour:person.phone.slice(-4),activated,duplicate,pendingReason:p.reason})]);
    await db.commit();
  }catch(error){await db.rollback();throw error;}
  finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);db.release();}
  let confirmation='not_sent';
  if(activated){
    try{const result=await sendConfirmation({to:person.phone,from:p.sender.phone_number,agencyId:client.agency_id,clientId:Number(client.id),purpose:'reminders',notificationCategory:'appointments',body:`${p.sender.registration.brandName}: You agreed to appointment texts. Frequency varies. Message and data rates may apply. Reply STOP to stop or HELP for help.`});confirmation=result?.sid||result?.id?'accepted':'review';}
    catch{confirmation='review';}
    await pool.execute('INSERT INTO user_activity_log (action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',['staff_verbal_reminder_confirmation',user.id,client.agency_id,JSON.stringify({clientId:Number(client.id),consentEventId:eventId,confirmation})]);
  }
  return {recorded:true,consentEventId:eventId,activated,duplicate,pendingReason:p.reason,confirmation};
}

async function enableReminderPreferences(db,client,person){
  const [[row]]=await db.execute('SELECT channels_json FROM client_session_notification_preferences WHERE agency_id=? AND client_id=? AND guardian_user_id=? FOR UPDATE',[client.agency_id,client.id,person.id]);
  const channels={in_app:true,email:true,phone:false,...parse(row?.channels_json),sms:true};
  await db.execute(`INSERT INTO client_session_notification_preferences (agency_id,client_id,guardian_user_id,channels_json,optional_reminders_enabled)
    VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE channels_json=VALUES(channels_json),optional_reminders_enabled=1`,[client.agency_id,client.id,person.id,JSON.stringify(channels)]);
  if(!person.id){await db.execute('UPDATE clients SET session_sms_opt_in=1 WHERE id=? AND agency_id=?',[client.id,client.agency_id]);return;}
  const [[saved]]=await db.execute('SELECT choices_json,revision FROM family_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=? FOR UPDATE',[client.agency_id,client.id,person.id]);
  // Do not create a family preference row that would reinterpret an existing
  // intake email choice. With no row, the normal channel/consent gates apply.
  if(!saved)return;
  const choices=parse(saved.choices_json);
  for(const key of ['appointments','schedule_changes',...(client.client_type==='school'?['school_sessions']:[])])choices[key]=['both','email'].includes(choices[key])?'both':'sms';
  await db.execute(`INSERT INTO family_notification_choices (agency_id,client_id,guardian_user_id,recipient_hash,phone_hash,choices_json,revision) VALUES (?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE phone_hash=VALUES(phone_hash),choices_json=VALUES(choices_json),revision=VALUES(revision)`,[client.agency_id,client.id,person.id,hash(person.email),hash(person.phone),JSON.stringify(choices),Number(saved?.revision||0)+1]);
}

// Called both by reminder preference readers and by the final send boundary.
export async function reviewedVerbalReminderGrant({evidence,agencyId,clientId,phone,recipientUserId=null}){
  if(evidence?.source!=='staff_verbal'||!Number(clientId))return null;
  for(const grant of evidence.grants||[]){
    if(grant.clientId!==Number(clientId)||(recipientUserId!=null&&grant.recipientUserId!==Number(recipientUserId)))continue;
    const [[event]]=await pool.execute(`SELECT evidence_json FROM sms_permission_events WHERE id=? AND scope_key=? AND phone=? AND purpose='reminders'`,[grant.consentEventId,eventScope(agencyId),normalizeSmsPhone(phone)]);
    const recorded=parse(event?.evidence_json);
    if(recorded.source!=='staff_verbal_attestation'||recorded.version!==VERBAL_REMINDER_CONSENT_VERSION||recorded.attested!==true||recorded.authorityConfirmed!==true||recorded.phoneConfirmed!==true||!recorded.actorUserId||recorded.clientId!==Number(clientId)||recorded.recipientUserId!==grant.recipientUserId)continue;
    const client={id:Number(clientId),agency_id:Number(agencyId)};
    const person=(await recipients(client)).find(r=>r.id===grant.recipientUserId&&r.phone===normalizeSmsPhone(phone));
    if(person)return {source:'staff_verbal',reference:`sms_permission_events:${grant.consentEventId}`,collectedAt:recorded.collectedAt,actorUserId:recorded.actorUserId};
  }
  const signed=evidence.previousSignedConsent;
  return signed?.signerVerified===true&&signed.signatureReference&&signed.collectedAt?signed:null;
}
