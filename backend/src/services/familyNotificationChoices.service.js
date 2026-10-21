import crypto from 'node:crypto';
import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import {normalizeSmsPhone} from '../utils/smsThreadIdentity.js';
import {dateToMysqlUtcDateTime,utcMysqlToIso} from '../utils/zonedWallTime.util.js';
import {FAMILY_CHOICE_VERSION,FAMILY_CHOICE_DISCLOSURE,FAMILY_NOTIFICATION_CATEGORIES,normalizeFamilyChoices,normalizeAccountUpdateChoices,defaultFamilyChoices,choiceAllows,familyNotificationCategory} from '../utils/familyNotificationChoices.js';
export const familyContactHash=value=>crypto.createHash('sha256').update(String(value||'').trim().toLowerCase()).digest('hex');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const unavailable=()=>fail('This preference link is unavailable or has expired. Ask your care team for a new link.',410);
async function currentRecipient(scope,db) {
  const [[row]]=await db.execute(`SELECT cg.permissions_json,cg.access_enabled,u.email,u.first_name,u.last_name,
    COALESCE(NULLIF(u.phone_number,''),NULLIF(u.personal_phone,''),NULLIF(u.work_phone,'')) AS phone,
    c.full_name,c.client_type,a.name AS agency_name,u.is_demo
    FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
    JOIN clients c ON c.id=cg.client_id JOIN agencies a ON a.id=c.agency_id
    WHERE cg.client_id=? AND cg.guardian_user_id=? AND c.agency_id=?
      AND cg.access_enabled=1 AND u.is_active=1 AND a.is_active=1
      AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())`,
    [scope.client_id,scope.guardian_user_id,scope.agency_id]);
  if(!row||ClientGuardian.isNoView(parse(row.permissions_json))||familyContactHash(row.email)!==scope.recipient_hash)throw unavailable();
  return row;
}
/** Issuance never subscribes anyone, creates accounts, sends mail or clears a prior decline. */
export async function createFamilyNotificationInvitation({agencyId,clientId,guardianUserId,actorUserId,forAccountSettings=false},db=pool) {
  if([agencyId,clientId,guardianUserId,actorUserId].some(v=>!Number.isSafeInteger(Number(v))||Number(v)<1))throw fail('A specific agency, child, guardian and staff member are required.');
  const [[user]]=await db.execute('SELECT email FROM users WHERE id=?',[guardianUserId]);
  const scope={agency_id:Number(agencyId),client_id:Number(clientId),guardian_user_id:Number(guardianUserId),recipient_hash:familyContactHash(user?.email)};
  const recipient=await currentRecipient(scope,db);
  const [[saved]]=await db.execute('SELECT choices_json FROM family_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[agencyId,clientId,guardianUserId]);
  if(!forAccountSettings&&saved&&Object.values(parse(saved.choices_json)).every(choice=>!choiceAllows(choice,'email')))throw fail('This recipient declined optional emails. Do not send another enrollment invitation.',409);
  const {latestIntakeCommunicationChoices}=await import('./intakeCommunicationChoices.service.js');
  const intake=await latestIntakeCommunicationChoices(clientId,agencyId);
  const own=Number(intake?.guardianUserId)===Number(guardianUserId)||familyContactHash(intake?.recipientEmail)===scope.recipient_hash;
  if(!forAccountSettings&&own&&intake?.emailPreference==='no')throw fail('This recipient declined email during enrollment. Use their permitted contact method.',409);
  const token=crypto.randomBytes(32).toString('hex');
  await db.execute(`INSERT INTO family_notification_invitations
    (token_hash,agency_id,client_id,guardian_user_id,recipient_hash,created_by_user_id,expires_at) VALUES (?,?,?,?,?,?,?)`,
    [familyContactHash(token),agencyId,clientId,guardianUserId,scope.recipient_hash,actorUserId,dateToMysqlUtcDateTime(new Date(Date.now()+30*86400000))]);
  return {url:`https://auricwell.com/api/public/family-notifications/${token}`,recipientEmail:recipient.email};
}
export async function familyNotificationInvitationContext(token,db=pool) {
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))throw unavailable();
  const [[scope]]=await db.execute('SELECT * FROM family_notification_invitations WHERE token_hash=?',[familyContactHash(token)]);
  const expiry=scope?.expires_at instanceof Date?scope.expires_at:new Date(utcMysqlToIso(scope?.expires_at));
  if(!scope||!Number.isFinite(+expiry)||+expiry<=Date.now())throw unavailable();
  const recipient=await currentRecipient(scope,db);
  const [[saved]]=await db.execute('SELECT * FROM family_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[scope.agency_id,scope.client_id,scope.guardian_user_id]);
  const {latestIntakeCommunicationChoices}=await import('./intakeCommunicationChoices.service.js');
  const latest=await latestIntakeCommunicationChoices(scope.client_id,scope.agency_id);
  const ownIntake=Number(latest?.guardianUserId)===Number(scope.guardian_user_id)||familyContactHash(latest?.recipientEmail)===scope.recipient_hash;
  const intake=ownIntake?latest:null;
  const choices=saved?normalizeFamilyChoices(parse(saved.choices_json)):defaultFamilyChoices({isSchool:recipient.client_type==='school',emailPreference:intake?.emailPreference});
  const savedAt=new Date(saved?.updated_at instanceof Date?saved.updated_at:utcMysqlToIso(saved?.updated_at)).getTime();
  const intakeAt=new Date(intake?.signedAt||intake?.submittedAt||0).getTime();
  if(saved&&intakeAt>savedAt)for(const category of FAMILY_NOTIFICATION_CATEGORIES) {
    if(intake.emailPreference==='no'||(intake.emailPreference==='scheduling_only'&&!['appointments','schedule_changes','school_sessions'].includes(category.key)))
      choices[category.key]=choiceAllows(choices[category.key],'sms')?'sms':'off';
  }
  const [[school]]=await db.execute(`SELECT disabled_at FROM school_session_email_preferences WHERE product='guardian' AND agency_id=? AND client_id=? AND recipient_hash=?`,[scope.agency_id,scope.client_id,scope.recipient_hash]);
  if(school?.disabled_at)choices.school_sessions=choiceAllows(choices.school_sessions,'sms')?'sms':'off';
  return {scope,recipient,choices,revision:Number(saved?.revision)||0};
}
/** A POST is required. A token permits preferences only, never access to the account or chart. */
export async function saveFamilyNotificationChoices({token,input},db=pool) {
  if(input?.confirm!=='yes'||input?.version!==FAMILY_CHOICE_VERSION)throw fail('Please review and confirm your notification choices.');
  const selected=normalizeAccountUpdateChoices(input.choices);
  if(!Number.isSafeInteger(Number(input.revision))||Number(input.revision)<0)throw fail('Reload this page before saving.');
  const connection=await db.getConnection();let locked=false;
  try {
    const context=await familyNotificationInvitationContext(token,connection),s=context.scope;
    const lockKey=`family-choices:${s.agency_id}:${s.client_id}:${s.guardian_user_id}`;
    const [[lock]]=await connection.execute('SELECT GET_LOCK(?,5) AS acquired',[lockKey]);
    if(!Number(lock?.acquired))throw fail('Your choices are being saved. Please try again.',409);
    locked=lockKey;await connection.beginTransaction();
    const current=await familyNotificationInvitationContext(token,connection);
    if(current.revision!==Number(input.revision))throw fail('Your choices changed in another window. Reload this page to see them.',409);
    // The one appointment row maps to the actual enrollment. Existing-family
    // preferences never enroll someone into unfinished-enrollment follow-ups.
    const choices={...current.choices,...selected,
      school_sessions:current.recipient.client_type==='school'?selected.appointments:'off'};
    const revision=current.revision+1,phone=normalizeSmsPhone(current.recipient.phone);
    await connection.execute(`INSERT INTO family_notification_choices
      (agency_id,client_id,guardian_user_id,recipient_hash,phone_hash,choices_json,revision) VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE recipient_hash=VALUES(recipient_hash),phone_hash=VALUES(phone_hash),choices_json=VALUES(choices_json),revision=VALUES(revision)`,
      [s.agency_id,s.client_id,s.guardian_user_id,s.recipient_hash,phone?familyContactHash(phone):null,JSON.stringify(choices),revision]);
    await connection.execute(`INSERT INTO family_notification_choice_events
      (agency_id,client_id,guardian_user_id,recipient_hash,choices_json,disclosure_version,disclosure_text,revision) VALUES (?,?,?,?,?,?,?,?)`,
      [s.agency_id,s.client_id,s.guardian_user_id,s.recipient_hash,JSON.stringify(choices),FAMILY_CHOICE_VERSION,FAMILY_CHOICE_DISCLOSURE,revision]);
    const schedule=['appointments','schedule_changes','school_sessions'];
    const channels={in_app:true,email:schedule.some(k=>choiceAllows(choices[k],'email')),sms:schedule.some(k=>choiceAllows(choices[k],'sms')),phone:false};
    await connection.execute(`INSERT INTO client_session_notification_preferences
      (agency_id,client_id,guardian_user_id,channels_json,optional_reminders_enabled,confirmation_requests_enabled,provider_pushed_updates_enabled,scheduling_changes_enabled)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE channels_json=VALUES(channels_json),optional_reminders_enabled=VALUES(optional_reminders_enabled),
      confirmation_requests_enabled=VALUES(confirmation_requests_enabled),provider_pushed_updates_enabled=VALUES(provider_pushed_updates_enabled),scheduling_changes_enabled=VALUES(scheduling_changes_enabled)`,
      [s.agency_id,s.client_id,s.guardian_user_id,JSON.stringify(channels),choices.appointments!=='off'||choices.school_sessions!=='off'?1:0,choices.appointments!=='off'?1:0,choices.schedule_changes!=='off'?1:0,choices.schedule_changes!=='off'?1:0]);
    await connection.execute(`UPDATE school_session_email_preferences SET disabled_at=?
      WHERE product='guardian' AND agency_id=? AND client_id=? AND recipient_hash=?`,
      [choiceAllows(choices.school_sessions,'email')?null:dateToMysqlUtcDateTime(new Date()),s.agency_id,s.client_id,s.recipient_hash]);
    await connection.commit();
    return {saved:true,revision,textPreferencesPending:Object.values(selected).some(c=>choiceAllows(c,'sms'))};
  }catch(error){await connection.rollback();throw error;}
  finally{if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[locked]);connection.release();}
}
export async function latestFamilyEmailSchedulingChoice({agencyId,clientId,to,after},db=pool) {
  if(!to)return null;
  const [rows]=await db.execute(`SELECT guardian_user_id,choices_json,updated_at FROM family_notification_choices
    WHERE agency_id=? AND client_id=? AND recipient_hash=?`,[agencyId,clientId,familyContactHash(to)]);
  if(rows.length!==1)return null;
  const row=rows[0],updated=new Date(row.updated_at instanceof Date?row.updated_at:utcMysqlToIso(row.updated_at));
  if(after&&+updated<=new Date(after).getTime())return null;
  const choices=parse(row.choices_json);
  return {guardianUserId:row.guardian_user_id,email:['appointments','school_sessions','schedule_changes'].some(k=>choiceAllows(choices[k],'email'))};
}
// Restricts existing permitted delivery; never creates SMS consent or bypasses an agency pause.
export async function familyNotificationDeliveryGate({agencyId,clientId,to,channel='email',templateType,notificationCategory},db=pool) {
  const category=notificationCategory||familyNotificationCategory(templateType);
  if(!category||!Number(agencyId))return {allowed:true};
  if(channel==='sms'&&category==='insurance')return {allowed:false,reason:'insurance_notifications_email_only'};
  if(!FAMILY_NOTIFICATION_CATEGORIES.some(c=>c.key===category))return {allowed:false,reason:'unknown_family_notification_category'};
  const address=channel==='sms'?normalizeSmsPhone(to):String(to||'').trim().toLowerCase();
  if(!address)return {allowed:false,reason:'family_notification_recipient_missing'};
  const column=channel==='sms'?'phone_hash':'recipient_hash';
  const [rows]=await db.execute(`SELECT choices_json,updated_at FROM family_notification_choices WHERE agency_id=? AND ${column}=?${clientId?' AND client_id=?':''}`,
    [Number(agencyId),familyContactHash(address),...(clientId?[Number(clientId)]:[])]);
  if(channel==='email'&&Number(clientId)) {
    const {latestIntakeCommunicationChoices}=await import('./intakeCommunicationChoices.service.js');
    const intake=await latestIntakeCommunicationChoices(clientId,agencyId);
    const signedAt=new Date(intake?.signedAt||intake?.submittedAt||0).getTime();
    const laterIntake=!rows.length||rows.every(row=>signedAt>new Date(row.updated_at instanceof Date?row.updated_at:utcMysqlToIso(row.updated_at)).getTime());
    if(laterIntake&&intake?.recipientEmail&&familyContactHash(intake.recipientEmail)===familyContactHash(address)) {
      if(intake.emailPreference==='no'||(intake.emailPreference==='scheduling_only'&&!['appointments','schedule_changes','school_sessions'].includes(category)))
        return {allowed:false,reason:'enrollment_email_choice_off'};
    }
  }
  // An invitation to review preferences is separate from unfinished enrollment.
  // It remains blocked when every optional email is off and by an intake decline.
  const invitation=['family_notification_invitation','portal_migration_invite'].includes(String(templateType||'').replace(/^trigger:/,''));
  const allowed=rows.every(row=>invitation&&channel==='email'
    ?Object.values(parse(row.choices_json)||{}).some(choice=>choiceAllows(choice,'email'))
    :choiceAllows(parse(row.choices_json)?.[category],channel));
  return {allowed,...(!allowed?{reason:'family_notification_category_off'}:{})};
}
