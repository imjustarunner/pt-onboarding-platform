import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import {normalizeSmsPhone} from '../utils/smsThreadIdentity.js';
import {contactReminderPhoneHash,contactReminderConsentLock} from '../utils/contactReminderConsent.js';
import {hasTerminalClientStatus} from './clientTerminationRoster.service.js';
import {validateSmsRegistration} from '../utils/smsCompliancePolicy.js';
import {latestIntakeCommunicationChoices} from './intakeCommunicationChoices.service.js';
import {choiceAllows} from '../utils/familyNotificationChoices.js';

const parse=value=>typeof value==='string'?JSON.parse(value):value||{};
const emailHash=value=>createHash('sha256').update(String(value||'').trim().toLowerCase()).digest('hex');
export const IMPORTED_GUARDIAN_CONSENT_SOURCE='prior_ehr_contact';
export function importedReminderChannels(value){
 const choice=String(value||'').trim();
 if(!choice)return null;
 if(/^(?:no reminders?|none|off|sin recordatorios)$/i.test(choice))return {email:false,sms:false};
 const email=/\be-?mail\b|correo electr[oó]nico/i.test(choice),sms=/\b(?:sms|texts?|text messages?|texto)\b/i.test(choice);
 return email||sms?{email,sms}:null;
}

// Source preferences are attributed to the importing staff member. They are not
// represented as a newly signed form or a START message from the recipient.
export async function seedImportedGuardianNotifications({agencyId,clientId,guardianUserId,affiliationId,contact,actorUserId},db=pool){
 const channels=importedReminderChannels(contact.appointmentReminders);
 if(!channels||!guardianUserId)return null;
 const currentIntake=await latestIntakeCommunicationChoices(clientId,agencyId,guardianUserId,contact.email);
 const [familyChoices]=await db.execute('SELECT choices_json FROM family_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[agencyId,clientId,guardianUserId]);
 if(currentIntake?.signatureAccepted||familyChoices?.[0])return {channels,source:IMPORTED_GUARDIAN_CONSENT_SOURCE,status:'superseded'};
 const [existing]=await db.execute('SELECT id,activation_status FROM imported_guardian_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[agencyId,clientId,guardianUserId]);
 if(existing[0])return {channels,source:IMPORTED_GUARDIAN_CONSENT_SOURCE,status:existing[0].activation_status};
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();
  const [prefs]=await connection.execute(`INSERT IGNORE INTO client_session_notification_preferences
   (agency_id,client_id,guardian_user_id,channels_json,optional_reminders_enabled,confirmation_requests_enabled,provider_pushed_updates_enabled,scheduling_changes_enabled)
   VALUES (?,?,?,?,1,1,1,1)`,[agencyId,clientId,guardianUserId,JSON.stringify({in_app:true,phone:false,...channels})]);
  const status=Number(prefs.affectedRows)!==1?'superseded':channels.sms?'pending_portal':'active';
  await connection.execute(`INSERT IGNORE INTO imported_guardian_notification_choices
   (agency_id,client_id,guardian_user_id,affiliation_id,email_hash,phone_hash,email_enabled,sms_enabled,source_reminders,recorded_by_user_id,activation_status)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[agencyId,clientId,guardianUserId,affiliationId,emailHash(contact.email),contactReminderPhoneHash(contact.mobilePhone||contact.phone||contact.homePhone||contact.workPhone),Number(channels.email),Number(channels.sms),String(contact.appointmentReminders).slice(0,255),actorUserId,status]);
  await connection.commit();return {channels,source:IMPORTED_GUARDIAN_CONSENT_SOURCE,status};
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}

async function currentChoices(id,db=pool){
 const [rows]=await db.execute(`SELECT n.*,u.email,u.role,u.is_active,u.is_archived,u.status,
  COALESCE(NULLIF(u.phone_number,''),NULLIF(u.personal_phone,''),u.work_phone) phone,
  cg.access_enabled,cg.permissions_json,c.status client_status,s.status_key client_status_key,s.label client_status_label,u.status_expires_at,
  p.channels_json,p.provider_pushed_updates_enabled
  FROM imported_guardian_notification_choices n JOIN users u ON u.id=n.guardian_user_id
  JOIN client_guardians cg ON cg.client_id=n.client_id AND cg.guardian_user_id=n.guardian_user_id
  JOIN clients c ON c.id=n.client_id AND c.agency_id=n.agency_id
  LEFT JOIN client_statuses s ON s.id=c.client_status_id
  JOIN client_session_notification_preferences p ON p.agency_id=n.agency_id AND p.client_id=n.client_id AND p.guardian_user_id=n.guardian_user_id
  WHERE n.id=?`,[id]);
 const row=rows[0],permissions=parse(row?.permissions_json);
 if(!row||!['client_guardian','guardian','client'].includes(row.role)||Number(row.access_enabled)!==1||Number(row.is_active)!==1||Number(row.is_archived)===1||['PENDING_SETUP','INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED'].includes(row.status)||row.status_expires_at&&new Date(row.status_expires_at)<=new Date()||row.client_status==='ARCHIVED'||hasTerminalClientStatus(row)||permissions.relationshipRevoked||permissions.billingOnly||permissions.noView||permissions.pendingGuardianVerification)return null;
 if(emailHash(row.email)!==row.email_hash||contactReminderPhoneHash(row.phone)!==row.phone_hash)return null;
 return row;
}

export async function importedGuardianEmailChoice({agencyId,clientId,guardianUserId,email},db=pool){
 if(!guardianUserId||!email)return null;
 const [rows]=await db.execute(`SELECT email_enabled FROM imported_guardian_notification_choices
  WHERE agency_id=? AND client_id=? AND guardian_user_id=? AND email_hash=? AND activation_status IN ('pending_portal','confirming','active')`,[agencyId,clientId,guardianUserId,emailHash(email)]);
 return rows[0]?.email_enabled!=null?{email:Number(rows[0].email_enabled)===1}:null;
}

export async function importedGuardianSmsAllowed({evidence,agencyId,clientId,recipientUserId,phone,purpose='reminders',allowConfirmation=false},db=pool){
 if(evidence?.source!==IMPORTED_GUARDIAN_CONSENT_SOURCE)return false;
 for(const grant of evidence.grants||[]){
  if(Number(grant.agencyId)!==Number(agencyId)||(clientId&&Number(grant.clientId)!==Number(clientId))||(recipientUserId&&Number(grant.guardianUserId)!==Number(recipientUserId)))continue;
  const row=await currentChoices(Number(grant.importId),db);
  if(row&&Number(row.agency_id)===Number(agencyId)&&Number(row.client_id)===Number(grant.clientId)&&Number(row.guardian_user_id)===Number(grant.guardianUserId)&&contactReminderPhoneHash(phone)===row.phone_hash&&parse(row.channels_json).sms===true&&(purpose!=='care'||Number(row.provider_pushed_updates_enabled)===1&&parse(row.permissions_json).canMessage!==false)&&(row.activation_status==='active'||allowConfirmation&&row.activation_status==='confirming')&&!await purposeDeclined(row,purpose,db))return true;
 }
 return false;
}

async function purposeDeclined(row,purpose,db){
 const intake=await latestIntakeCommunicationChoices(row.client_id,row.agency_id,row.guardian_user_id,row.email);
 if(purpose==='care'&&intake?.providerTextingOptIn==='no'||purpose==='reminders'&&intake?.smsPreference==='no')return true;
 if(purpose==='reminders'){
  const [choices]=await db.execute('SELECT choices_json FROM family_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[row.agency_id,row.client_id,row.guardian_user_id]);
  if(choices?.[0]?.choices_json&&!choiceAllows(parse(choices[0].choices_json).appointments,'sms'))return true;
 }
 return false;
}

// Called only as the authenticated parent establishes/opens their portal. A
// phone-scoped lock is shared with STOP/category commands; later choices win.
export async function activateImportedGuardianNotifications(guardianUserId,overrides={}){
 const db=overrides.db||pool;
 const sms=overrides.sms||await import('./smsCompliance.service.js');
 const send=overrides.send||((options)=>import('./vonage.service.js').then(({default:transport})=>transport.sendSms(options)));
 const [pending]=await db.execute("SELECT id,agency_id FROM imported_guardian_notification_choices WHERE guardian_user_id=? AND activation_status='pending_portal'",[guardianUserId]);
 const results=[];
 for(const item of pending){
  let connection,lock,locked=false;
  try{
   let row=await currentChoices(item.id,db);if(!row)continue;
   const phone=normalizeSmsPhone(row.phone),from=await sms.resolveRegisteredSmsSender({agencyId:row.agency_id,purpose:'reminders'});if(!phone||!from)continue;
   const sender=await sms.getSmsSender(from);
   if(validateSmsRegistration(sender.registration).length||!['reminders','care'].every(purpose=>sender.registration.purposes.includes(purpose))){results.push({id:item.id,status:'sender_not_ready'});continue;}
   connection=await db.getConnection();lock=contactReminderConsentLock(sender,phone);
   const [[claim]]=await connection.execute('SELECT GET_LOCK(?,0) locked',[lock]);if(Number(claim?.locked)!==1)continue;locked=true;
   row=await currentChoices(item.id,db);if(!row||row.activation_status!=='pending_portal')continue;
   if(await sms.isSmsSuppressed(sender,phone)){results.push({id:item.id,status:'suppressed'});continue;}
   const channels=parse(row.channels_json);
   if(channels.sms!==true){await db.execute("UPDATE imported_guardian_notification_choices SET activation_status='superseded' WHERE id=? AND activation_status='pending_portal'",[row.id]);continue;}
   const [permissions]=await db.execute("SELECT purpose,status,evidence_json FROM sms_recipient_permissions WHERE scope_key=? AND phone=? AND purpose IN ('reminders','care')",[sender.scope,phone]);
   const accepted=[];
   for(const purpose of ['reminders',...(Number(row.provider_pushed_updates_enabled)===1&&parse(row.permissions_json).canMessage!==false?['care']:[])])if(permissions.find(p=>p.purpose===purpose)?.status!=='opted_out'&&!await purposeDeclined(row,purpose,db))accepted.push(purpose);
   if(!accepted.length){await db.execute("UPDATE imported_guardian_notification_choices SET activation_status='superseded' WHERE id=? AND activation_status='pending_portal'",[row.id]);continue;}
   const [[claimed]]=await db.execute("SELECT activation_status FROM imported_guardian_notification_choices WHERE id=?",[row.id]);if(claimed?.activation_status!=='pending_portal')continue;
   await db.execute("UPDATE imported_guardian_notification_choices SET activation_status='confirming' WHERE id=? AND activation_status='pending_portal'",[row.id]);
   const written=[];
   try{
    for(const purpose of accepted){
     const prior=permissions.find(p=>p.purpose===purpose),previous=parse(prior?.evidence_json);
     if(prior?.status==='opted_in'&&previous.source!==IMPORTED_GUARDIAN_CONSENT_SOURCE)continue;
     const grant={importId:Number(row.id),agencyId:Number(row.agency_id),clientId:Number(row.client_id),guardianUserId:Number(row.guardian_user_id)};
     const grants=[...(previous.grants||[]).filter(g=>Number(g.importId)!==grant.importId),grant];
     await sms.recordSmsPermission({scope:sender.scope,phone,purpose,status:'opted_in',evidence:{source:IMPORTED_GUARDIAN_CONSENT_SOURCE,reference:`imported_guardian_choice:${row.id}`,collectedAt:new Date(row.created_at).toISOString(),importedByUserId:row.recorded_by_user_id,actor:{kind:'automation',source:'guardian_portal_import_activation'},sourceReminders:row.source_reminders,grants}});written.push({purpose,prior});
    }
    const [previousConfirmations]=accepted.every(purpose=>permissions.find(p=>p.purpose===purpose)?.status==='opted_in')?await db.execute("SELECT confirmation_message_id FROM imported_guardian_notification_choices WHERE agency_id=? AND guardian_user_id=? AND phone_hash=? AND activation_status='active' AND confirmation_message_id IS NOT NULL ORDER BY id DESC LIMIT 1",[row.agency_id,row.guardian_user_id,row.phone_hash]):[[]];
    const brand=sender.registration?.brandName||sender.agency_name||'AuricWell';
    const locale=overrides.locale?await overrides.locale(row):(await import('./familyPortalLocale.service.js').then(m=>m.familyEnrollmentContext(row.guardian_user_id,row.agency_id,db))).locale;
    const labels=accepted.map(p=>p==='reminders'?(locale==='es'?'recordatorios de citas':'appointment reminders'):(locale==='es'?'mensajes de su proveedor':'provider messages')).join(locale==='es'?' y ':' and ');
    const body=locale==='es'?`${brand}: Su portal está listo. Sus preferencias guardadas autorizan mensajes de texto para ${labels}. La frecuencia varía. Pueden aplicarse tarifas de mensajes y datos. Responda NOREMIND para detener recordatorios, NOPROVIDER para detener mensajes del proveedor, STOP para detener todos los mensajes o HELP para obtener ayuda.`:`${brand}: Your portal is ready. Your saved choices opt you in to text ${labels}. Message frequency varies. Message and data rates may apply. Reply NOREMIND to stop reminders, NOPROVIDER to stop provider texts, STOP to stop all texts, or HELP for help.`;
    const sent=previousConfirmations[0]?.confirmation_message_id?{sid:previousConfirmations[0].confirmation_message_id}:await send({to:phone,from:sender.phone_number,agencyId:row.agency_id,clientId:row.client_id,recipientUserId:row.guardian_user_id,purpose:accepted[0],confirmationPurposes:accepted,notificationCategory:'imported_opt_in_confirmation',body});
    if(!sent?.sid&&!sent?.id)throw Object.assign(new Error('Confirmation not accepted'),{code:'confirmation_not_accepted'});
    await db.execute("UPDATE imported_guardian_notification_choices SET activation_status='active',confirmation_message_id=?,confirmation_at=UTC_TIMESTAMP(),last_error_code=NULL WHERE id=? AND activation_status='confirming'",[sent.sid||sent.id,row.id]);results.push({id:row.id,status:'active'});
   }catch(error){
    for(const{purpose,prior}of written)await sms.recordSmsPermission({scope:sender.scope,phone,purpose,status:prior?.status||'opted_out',evidence:prior?parse(prior.evidence_json):{source:'import_confirmation_failed',reference:`imported_guardian_choice:${row.id}`}});
    await db.execute("UPDATE imported_guardian_notification_choices SET activation_status='failed',last_error_code=? WHERE id=? AND activation_status='confirming'",[String(error.code||'confirmation_failed').slice(0,100),row.id]);results.push({id:row.id,status:'failed'});
   }
  }finally{if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);connection?.release();}
 }
 return results;
}
