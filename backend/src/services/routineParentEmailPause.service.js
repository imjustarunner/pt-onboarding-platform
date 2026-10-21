import pool from '../config/database.js';
import {familyNotificationDeliveryGate} from './familyNotificationChoices.service.js';

const email = value => String(value || '').trim().toLowerCase();
function addresses(value) {
  if(Array.isArray(value)) return value.flatMap(addresses);
  if(value && typeof value==='object') return addresses(value.email || value.address);
  return (String(value || '').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/ig) || []).map(email);
}
const recovery = new Set(['password_reset','admin_initiated_password_reset','account_login_help','school_staff_account_recovery',
  'guardian_portal_login_info','auricwell_account_recovery']);
const familyTypes = new Set(['hub_portal_invite','portal_migration_invite','co_guardian_invite','co_guardian_invite_failed','guardian_plan_review',
  'adaptive_full_intake_invite','intake_packet_completion','intake_summary_pdf_copy','insurance_card_followup',
  'session_reminder','session_confirmation','session_change','session_cancellation','school_session_notice','auricwell_session_reminder',
  'client_renewal','provider_waitlist_update','learning_client_message','school_roi_signer_completion','school_roi_signing','smart_school_roi']);
const parentRoles = new Set(['client','client_guardian','guardian']);
const staffRoles = new Set(['admin','super_admin','support','staff','provider','provider_plus','school_staff','clinical_practice_assistant','intern','supervisor','schedule_manager','facilitator','tutor']);

/** Temporary agency rollout control, separate from recipients' saved preferences.
 * Every transport rechecks it, including approval/retry of previously queued mail.
 * Demo mail, actual recovery/security events and deliberately authored staff email
 * remain available. Resuming this control does not reset any reminder sent markers.
 */
async function parentPauseGate({agencyId,to,cc,bcc,source='auto',templateType,clientId,existingCommunicationId}, db=pool) {
  const type=String(templateType || '').replace(/^trigger:/,'').toLowerCase();
  if(recovery.has(type) || type.startsWith('security_')) return {allowed:true};
  const recipients=[...new Set([...addresses(to),...addresses(cc),...addresses(bcc)])];
  if(recipients.length && recipients.every(address=>address==='testing@itsco.health' || address.endsWith('@example.com'))) return {allowed:true};
  let origin=String(source || '').toLowerCase();
  // A direct staff-authored email is not an automatic reminder.
  if(origin==='manual' && (!existingCommunicationId || type==='hub_email')) return {allowed:true};
  if(!Number(agencyId)) return {allowed:true};
  const [[control]]=await db.execute('SELECT routine_emails_paused FROM agency_parent_email_controls WHERE agency_id=?',[Number(agencyId)]);
  if(!Number(control?.routine_emails_paused)) return {allowed:true};
  if(existingCommunicationId) {
    const [[communication]]=await db.execute('SELECT metadata FROM user_communications WHERE id=?',[existingCommunicationId]);
    let metadata=communication?.metadata;
    if(typeof metadata==='string') { try { metadata=JSON.parse(metadata); } catch { metadata=null; } }
    origin=String(metadata?.source || 'auto').toLowerCase();
    if(origin==='manual') return {allowed:true};
  }
  if(!recipients.length) return {allowed:false,reason:'routine_parent_emails_paused'};
  const [users]=await db.execute(`SELECT LOWER(email) AS email,LOWER(role) AS role FROM users WHERE LOWER(email) IN (${recipients.map(()=>'?').join(',')})`,recipients);
  const knownParent=users.some(user=>parentRoles.has(user.role));
  const onlyStaff=recipients.every(address=>users.some(user=>user.email===address && staffRoles.has(user.role) && !parentRoles.has(user.role)));
  if(onlyStaff && !knownParent) return {allowed:true};
  let parent=knownParent || familyTypes.has(type) || type.startsWith('family_') || type.startsWith('enrollment_unfinished_reminder');
  if(!parent && clientId) {
    const [[client]]=await db.execute('SELECT email FROM clients WHERE id=? AND agency_id=?',[clientId,agencyId]);
    parent=recipients.some(address=>address===email(client?.email));
  }
  return parent ? {allowed:false,reason:'routine_parent_emails_paused'} : {allowed:true};
}

export async function routineParentEmailGate(input,db=pool) {
  const pause=await parentPauseGate(input,db);
  if(!pause.allowed)return pause;
  // Apply saved personal choices even to a staff-approved retry or demo send.
  // The pause and this preference gate both run before recipient redirection.
  for(const to of new Set([...addresses(input.to),...addresses(input.cc),...addresses(input.bcc)])) {
    const choice=await familyNotificationDeliveryGate({...input,to,channel:'email'},db);
    if(!choice.allowed)return choice;
  }
  return pause;
}
