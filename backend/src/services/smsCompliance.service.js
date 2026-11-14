import { verbalReminderProgramReady } from '../utils/staffVerbalReminderConsent.js';
import { withStaffPollDisclosure } from './staffSmsDisclosure.service.js';
import { sendApplicationHelpReply } from './smsHelpReply.service.js';
import { contactReminderConsentLock } from '../utils/contactReminderConsent.js';
import {ITSCO_STAFF_ASSISTANT_NUMBER} from '../utils/staffSmsAssistant.js';
import { staffCommunicationKey, phoneFingerprint, STAFF_COMMUNICATION_CHOICES, withExchangeSmsOptOut, withCheckinSmsOptOut } from '../utils/staffCommunicationChoices.js';
import { exchangeSmsOptedOut, setExchangeSmsPreference, restartExchangeSms } from './exchangeSmsPreference.service.js';
import { pauseStaffReminderTexts, restartStaffReminderTexts, withStaffReminderOptOut } from './staffReminderSmsPreference.service.js';
import { checkinSmsOptedOut, setCheckinSmsPreference, restartCheckinSms } from './checkinSmsPreference.service.js';
import { categoryRestartMessage } from '../utils/smsCategoryRestart.js';
import { setProviderRelayPreference, restartProviderRelay, cancelPendingRelayReplies } from './providerRelayPreference.service.js';
import pool from '../config/database.js';
import { allowQaSmsDelivery } from '../utils/auricwellQaPolicy.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { parseSmsKeyword, SMS_PURPOSES, smsPolicyError, validateSmsRegistration, formatRegisteredSms } from '../utils/smsCompliancePolicy.js';
import { CLIENT_SMS_PURPOSES, assertSmsCarrierPurpose, notifyreCampaignForAgency } from '../utils/smsCarrierPolicy.js';
import { notifyrePhoneStopped, applyNotifyreAccountCommand, notifyrePurposeOptedOut, declineNotifyrePurpose, restartNotifyrePurpose } from './notifyreRecipientState.service.js';

const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
// One-use capabilities bind an automated control reply to its exact recipient/body.
const controlReplies = new WeakSet();
const staffAssistantReplies = new WeakSet();
// Internal capability for an immediate reply to one authenticated-webhook request.
// It is never accepted from an HTTP body or reused for unsolicited notifications.
export function staffAssistantReplyCapability({from,to,body,messageId}) {
  if(!messageId||!from||!to||!body)throw smsPolicyError('sms_assistant_reply_invalid','An inbound request is required');
  const capability=Object.freeze({from:normalizeSmsPhone(from),to:normalizeSmsPhone(to),body,messageId});
  staffAssistantReplies.add(capability);return capability;
}

export async function getSmsSender(from) {
  const phone = normalizeSmsPhone(from);
  if (!phone) throw smsPolicyError('sms_invalid_sender', 'A valid sending number is required');
  const [rows] = await pool.execute(
    `SELECT n.id, n.agency_id, n.phone_number, n.is_active, n.status,
            a.name AS agency_name, a.phone_number AS support_phone, a.slug AS agency_slug, a.feature_flags AS agency_feature_flags,
            r.campaign_id, r.registration_json
     FROM twilio_numbers n LEFT JOIN agencies a ON a.id = n.agency_id
     LEFT JOIN sms_sender_registrations r ON r.number_id = n.id
     WHERE n.phone_number = ? LIMIT 2`, [phone]
  );
  if (rows.length > 1) throw smsPolicyError('sms_ambiguous_sender', 'This phone number has conflicting agency assignments');
  const row = rows[0];
  if (!row || !row.is_active || row.status === 'released') throw smsPolicyError('sms_unknown_sender', 'Sending number is not active in AuricWell');
  return { ...row, registration: row.registration_json ? json(row.registration_json) : null,
    scope: row.campaign_id ? `campaign:${row.campaign_id}` : `number:${row.id}` };
}

export async function recordSmsPermission({ scope, phone, purpose, status, evidence, expiresAt = null, onRecorded = null }) {
  const recipient = normalizeSmsPhone(phone);
  if (!recipient || !scope || ![...SMS_PURPOSES, 'suppression'].includes(purpose)
      || !['opted_in', 'opted_out'].includes(status) || !evidence?.source) {
    throw smsPolicyError('sms_invalid_permission', 'Valid SMS permission and evidence are required');
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const details = JSON.stringify(evidence);
    await connection.execute(
      `INSERT INTO sms_recipient_permissions (scope_key, phone, purpose, status, evidence_json, expires_at)
       VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status),
       evidence_json = VALUES(evidence_json), expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP`,
      [scope, recipient, purpose, status, details, expiresAt]
    );
    await connection.execute(
      `INSERT INTO sms_permission_events (scope_key, phone, purpose, status, evidence_json, provider_message_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [scope, recipient, purpose, status, details, evidence.messageId || null]
    );
    if (onRecorded) await onRecorded(connection);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return false;
    throw error;
  }
  finally { connection.release(); }
}

export async function isSmsSuppressed(sender, phone) {
  if (sender.registration?.provider === 'notifyre' && await notifyrePhoneStopped(phone)) return true;
  // Number fallback preserves a STOP received before a campaign was configured.
  const [rows] = await pool.execute(
    `SELECT 1 FROM sms_recipient_permissions WHERE scope_key IN (?, ?)
     AND phone = ? AND purpose = 'suppression' AND status = 'opted_out' LIMIT 1`,
    [sender.scope, `number:${sender.id}`, normalizeSmsPhone(phone)]
  );
  if (rows.length) return true;
  // Preserve existing opt-outs during rollout. Do not convert any old opt-in
  // flags into consent. An explicit, later START clears the legacy restriction.
  const [restarted] = await pool.execute(
    `SELECT 1 FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ?
     AND purpose = 'suppression' AND status = 'opted_in' LIMIT 1`,
    [sender.scope, normalizeSmsPhone(phone)]
  );
  if (restarted.length) return false;
  const digits = normalizeSmsPhone(phone)?.slice(1);
  const local = digits?.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const [legacy] = await pool.execute(
    `SELECT 1 FROM twilio_opt_in_state o JOIN clients c ON c.id = o.client_id
     JOIN twilio_numbers n ON n.id = o.number_id
     LEFT JOIN sms_sender_registrations r ON r.number_id = n.id
     WHERE o.status = 'opted_out' AND (o.number_id = ? OR r.campaign_id = ?)
     AND REGEXP_REPLACE(COALESCE(c.contact_phone, ''), '[^0-9]', '') IN (?, ?) LIMIT 1`,
    [sender.id, sender.campaign_id || null, digits, local]
  );
  if (legacy.length) return true;
  const [staff] = await pool.execute(
    `SELECT 1 FROM agency_campaign_opt_outs o JOIN users u ON u.id = o.user_id
     WHERE o.agency_id = ? AND (
       REGEXP_REPLACE(COALESCE(u.phone_number, ''), '[^0-9]', '') IN (?, ?)
       OR REGEXP_REPLACE(COALESCE(u.personal_phone, ''), '[^0-9]', '') IN (?, ?)
       OR REGEXP_REPLACE(COALESCE(u.work_phone, ''), '[^0-9]', '') IN (?, ?)) LIMIT 1`,
    [sender.agency_id, digits, local, digits, local, digits, local]
  );
  return staff.length > 0;
}

export async function prepareSmsDelivery({ to, from, body, purpose, mediaUrl, complianceReply, agencyId, staffNotificationKind = 'notifications', senderFirstName, staffAssistantReply, hiringUserId, companyEventId, companyEventReply = false, clientId, notificationCategory, providerRelayEnrollmentId, reminderFooter = null }) {
  const recipient = normalizeSmsPhone(to);
  if (!recipient) throw smsPolicyError('sms_invalid_recipient', 'A valid recipient number is required');
  if (mediaUrl) throw smsPolicyError('sms_mms_unsupported', 'Attachments require a configured MMS transport; nothing was sent');
  const sender = await getSmsSender(from);
  if (agencyId != null && Number(sender.agency_id) !== Number(agencyId)) {
    throw smsPolicyError('sms_sender_agency_mismatch', 'The sending number belongs to a different agency');
  }
  if (complianceReply && controlReplies.has(complianceReply)
      && complianceReply.to === recipient && complianceReply.from === sender.phone_number && complianceReply.body === body) {
    controlReplies.delete(complianceReply);
    if (complianceReply.categoryReply && await isSmsSuppressed(sender, recipient)) {
      throw smsPolicyError('sms_opted_out', 'Recipient has opted out of this SMS campaign');
    }
    return { to: recipient, from: sender.phone_number, agencyId: sender.agency_id, body, registration: sender.registration, controlReply: true };
  }
  if (!allowQaSmsDelivery({id:sender.agency_id,slug:sender.agency_slug,feature_flags:sender.agency_feature_flags},{to:recipient,purpose,clientId})) {
    throw smsPolicyError('sms_qa_recipient_blocked','QA texts are limited to the owner-approved testing phone.');
  }
  const registration = sender.registration;
  if (validateSmsRegistration(registration).length) throw smsPolicyError('sms_campaign_not_ready', 'SMS campaign registration and number linking must be verified before sending');
  if (!SMS_PURPOSES.includes(purpose) || !registration.purposes.includes(purpose)) {
    throw smsPolicyError('sms_campaign_purpose_mismatch', 'This sending number is not registered for the requested SMS purpose');
  }
  assertSmsCarrierPurpose({ registration, purpose });
  if (await isSmsSuppressed(sender, recipient)) throw smsPolicyError('sms_opted_out', 'Recipient has opted out of this SMS campaign');
  if (providerRelayEnrollmentId) {
    const [enrollments] = await pool.execute('SELECT * FROM provider_sms_relay_enrollments WHERE id=? AND agency_id=? AND number_id=? AND phone=?',
      [providerRelayEnrollmentId, sender.agency_id, sender.id, recipient]);
    const { relayEnrollmentReady } = await import('./providerSmsRelaySettings.service.js');
    if (purpose !== 'care' || enrollments.length !== 1 || !await relayEnrollmentReady(enrollments[0]))
      throw smsPolicyError('sms_relay_disabled', 'Personal-phone client forwarding is off');
  }
  if(notificationCategory) {
    const {familyNotificationDeliveryGate}=await import('./familyNotificationChoices.service.js');
    const choice=await familyNotificationDeliveryGate({agencyId:sender.agency_id,clientId,to:recipient,channel:'sms',notificationCategory});
    if(!choice.allowed)throw smsPolicyError(choice.reason,'This notification type is turned off for this recipient.');
  }
  if (companyEventId != null) {
    const [events] = await pool.execute('SELECT id FROM company_events WHERE id = ? AND agency_id = ?', [Number(companyEventId), Number(sender.agency_id)]);
    if (!events.length) throw smsPolicyError('event_sms_invalid_event', 'Event does not belong to this sending agency');
    const [muted] = await pool.execute('SELECT 1 FROM company_event_sms_preferences WHERE company_event_id = ? AND phone = ? LIMIT 1', [Number(companyEventId), recipient]);
    if (muted.length) throw smsPolicyError('event_sms_muted', 'Recipient has turned off texts about this event');
  }
  if (purpose === 'workforce' && staffNotificationKind === 'hiring') {
    if(!Number.isSafeInteger(Number(hiringUserId))||Number(hiringUserId)<1)throw smsPolicyError('sms_hiring_consent_required','The hiring recipient must be identified.');
    const [grants] = await pool.execute(`SELECT r.id FROM hire_communication_preferences p
      JOIN sms_consent_requests r ON r.id=p.consent_request_id AND r.agency_id=p.agency_id AND r.phone=p.phone
      JOIN sms_sender_registrations s ON s.number_id=r.number_id
      WHERE p.user_id=? AND p.agency_id=? AND p.phone=? AND p.channel='email_sms' AND s.campaign_id=?
      AND r.signed_at IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(r.disclosure_json,'$.enrollmentCategory'))='hiring'
      AND JSON_EXTRACT(r.activation_json,'$.workforce.activated')=TRUE
      AND JSON_UNQUOTE(JSON_EXTRACT(r.activation_json,'$.workforce.choice'))='yes' LIMIT 1`,[Number(hiringUserId),sender.agency_id,recipient,sender.campaign_id]);
    if(!grants.length)throw smsPolicyError('sms_hiring_consent_required','Reviewed hiring notification consent is required.');
    return {to:recipient,from:sender.phone_number,agencyId:sender.agency_id,body:formatRegisteredSms(body,registration.brandName),registration,purpose};
  }
  if(purpose==='workforce' && sender.phone_number===ITSCO_STAFF_ASSISTANT_NUMBER && staffAssistantReply && staffAssistantReplies.has(staffAssistantReply)
      && staffAssistantReply.from===sender.phone_number && staffAssistantReply.to===recipient && staffAssistantReply.body===body) {
    staffAssistantReplies.delete(staffAssistantReply);
    return {to:recipient,from:sender.phone_number,agencyId:sender.agency_id,body:formatRegisteredSms(body,registration.brandName),registration,purpose};
  }
  const staffStates = [];
  if (purpose === 'workforce' && staffNotificationKind === 'exchangeMatches'
      && await exchangeSmsOptedOut({ agencyId: sender.agency_id, phone: recipient })) {
    throw smsPolicyError('sms_exchange_opted_out', 'Client Exchange texts are turned off for this phone and agency');
  }
  if (purpose === 'workforce' && staffNotificationKind === 'kioskArrivals'
      && await checkinSmsOptedOut({ agencyId: sender.agency_id, phone: recipient })) {
    throw smsPolicyError('sms_checkin_opted_out', 'Check-in reminders are turned off for this phone and agency');
  }
  if (['workforce','polling'].includes(purpose)) {
    const digits=recipient.slice(1), local=digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;
    const [inactiveStaff] = await pool.execute(
      `SELECT 1 FROM users u
       WHERE (u.is_active = 0 OR UPPER(COALESCE(u.status,'')) IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED'))
         AND (REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
           OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?)
           OR REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?)) LIMIT 1`,
      [digits, local, digits, local, digits, local]
    );
    if (inactiveStaff.length) throw smsPolicyError('sms_staff_inactive', 'Inactive employees are not enrolled in personal texts');
    const [staff]=await pool.execute(`SELECT u.is_active, u.status, JSON_EXTRACT(p.notification_categories, ?) AS choices
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id JOIN user_preferences p ON p.user_id=u.id
      WHERE ua.agency_id=? AND (REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
      OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?) OR REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?))`,
      [`$.${staffCommunicationKey(sender.agency_id)}`,sender.agency_id,digits,local,digits,local,digits,local]);
    for (const row of staff) {
      if (row.is_active === 0 || row.is_active === false || ['INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED'].includes(String(row.status || '').toUpperCase())) {
        throw smsPolicyError('sms_staff_inactive', 'Inactive employees are not enrolled in personal texts');
      }
      const state=row.choices?json(row.choices):null;
      if(state)staffStates.push(state);
      const kind=purpose==='polling'?'polling':staffNotificationKind;
      if(state && (state.phoneHash!==phoneFingerprint(recipient)||!STAFF_COMMUNICATION_CHOICES.some(choice=>choice.key===kind)||state.choices?.[kind]!==true))
        throw smsPolicyError('sms_staff_choice_off','This staff member has not enabled this personal-phone text category');
    }
  }
  const [permissions] = await pool.execute(
    `SELECT evidence_json FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = ?
     AND status = 'opted_in' AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1`,
    [sender.scope, recipient, purpose]
  );
  if (!permissions.length) throw smsPolicyError('sms_consent_required', 'Recorded recipient consent for this SMS purpose is required');
  const evidence = permissions[0].evidence_json ? json(permissions[0].evidence_json) : null;
  if (purpose==='reminders' && evidence?.source==='staff_verbal') {
    if(!verbalReminderProgramReady(registration))throw smsPolicyError('sms_verbal_program_not_ready','This campaign has not enabled its approved verbal reminder script.');
    const {reviewedVerbalReminderGrant}=await import('./staffVerbalReminderConsent.service.js');
    if(!await reviewedVerbalReminderGrant({evidence,agencyId:sender.agency_id,clientId,phone:recipient}))throw smsPolicyError('sms_verbal_recipient_changed','The recorded reminder consent no longer matches this client and phone.');
  }
  if (evidence?.staffCommunicationReference && staffStates.some(state => state.reference !== evidence.staffCommunicationReference)) {
    throw smsPolicyError('sms_consent_review_required', 'Updated signed choices are awaiting administrator review');
  }
  if (['workforce', 'polling'].includes(purpose) && String(evidence?.reference || '').startsWith('staff_communications:')) {
    throw smsPolicyError('sms_consent_review_required', 'Staff preferences require administrator-reviewed SMS enrollment before delivery');
  }
  let content = purpose === 'reminders' && !/\bNOREMIND\b/i.test(body)
    ? `${body} Reply NOREMIND to stop appointment reminders only.` : body;
  if (reminderFooter === 'noremind') content = withStaffReminderOptOut(content);
  if (purpose === 'workforce' && staffNotificationKind === 'exchangeMatches') content = withExchangeSmsOptOut(content);
  const checkinAlert = purpose === 'workforce' && staffNotificationKind === 'kioskArrivals';
  if (checkinAlert) content = withCheckinSmsOptOut(content);
  if (purpose === 'polling' && !/\bNOPOLLS\b/i.test(content)) content += ' Reply NOPOLLS to stop poll texts only.';
  if (purpose === 'polling') content = await withStaffPollDisclosure({ sender, phone: recipient, body: content, reply: companyEventReply });
  const includeOptOut = purpose !== 'polling' && !checkinAlert && reminderFooter !== 'noremind' && !(purpose === 'care' && (senderFirstName || providerRelayEnrollmentId));
  return { to: recipient, from: sender.phone_number, agencyId: sender.agency_id, body: formatRegisteredSms(content, registration.brandName, purpose === 'care' ? senderFirstName : null, { includeOptOut }), registration, purpose,
    ...(['polling', 'workforce'].includes(purpose) ? { noticeScope: sender.scope } : {}) };
}

export async function resolveRegisteredSmsSender({ agencyId, purpose, numberId = null, requiredPurpose = null }) {
  if (!Number(agencyId) || !SMS_PURPOSES.includes(purpose)) return null;
  if (numberId != null && (!Number.isSafeInteger(Number(numberId)) || Number(numberId) <= 0)) return null;
  if (requiredPurpose != null && !SMS_PURPOSES.includes(requiredPurpose)) return null;
  const clientTraffic = CLIENT_SMS_PURPOSES.includes(purpose);
  if (requiredPurpose && CLIENT_SMS_PURPOSES.includes(requiredPurpose) !== clientTraffic) return null;
  const campaign = clientTraffic ? notifyreCampaignForAgency(agencyId) : null;
  if (clientTraffic && !campaign) return null;
  const [rows] = await pool.execute(
    `SELECT n.phone_number FROM twilio_numbers n JOIN sms_sender_registrations r ON r.number_id = n.id
     WHERE n.agency_id = ? AND n.is_active = TRUE AND n.status <> 'released'
       AND JSON_CONTAINS(JSON_EXTRACT(r.registration_json, '$.purposes'), JSON_QUOTE(?))
       AND JSON_EXTRACT(r.registration_json, '$.approved') = TRUE
       AND JSON_EXTRACT(r.registration_json, '$.numberLinked') = TRUE
       AND (? IS NULL OR n.id = ?)
       AND (? IS NULL OR JSON_CONTAINS(JSON_EXTRACT(r.registration_json, '$.purposes'), JSON_QUOTE(?)))
       AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.registration_json, '$.provider')), 'vonage') = ?
       AND (? IS NULL OR r.campaign_id = ?)
       AND (? IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(r.registration_json, '$.brandId')) = ?)
     ORDER BY n.id LIMIT 1`, [Number(agencyId), purpose, numberId, numberId, requiredPurpose, requiredPurpose,
       clientTraffic ? 'notifyre' : 'vonage', campaign?.campaignId || null, campaign?.campaignId || null,
       campaign?.brandId || null, campaign?.brandId || null]
  );
  return rows[0]?.phone_number || null;
}

// Preference readers may recognize a later signed enrollment, but this lookup
// never authorizes delivery. sendSms still rechecks registration and STOP.
export async function recordedReminderConsent(agencyId, phone, { requireActive = false, ...context } = {}) {
  const normalized = normalizeSmsPhone(phone);
  if (!normalized) return null;
  const from = await resolveRegisteredSmsSender({ agencyId, purpose: 'reminders' });
  if (!from) return null;
  const sender = await getSmsSender(from);
  if (requireActive && await isSmsSuppressed(sender, normalized)) return null;
  const [rows] = await pool.execute(`SELECT evidence_json FROM sms_recipient_permissions
    WHERE scope_key = ? AND phone = ? AND purpose = 'reminders' AND status = 'opted_in'
      AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1`, [sender.scope, normalized]);
  const evidence = rows[0]?.evidence_json ? json(rows[0].evidence_json) : null;
  if(evidence?.source==='staff_verbal'){
    if(!verbalReminderProgramReady(sender.registration))return null;
    const {reviewedVerbalReminderGrant}=await import('./staffVerbalReminderConsent.service.js');
    return reviewedVerbalReminderGrant({evidence,agencyId,phone:normalized,...context});
  }
  return evidence?.signerVerified === true && evidence?.signatureReference && evidence?.collectedAt ? evidence : null;
}

// A client-initiated question permits a bounded reply to that conversation. It
// does not subscribe the recipient to reminders, workforce messages or offers.
export async function recordInboundConversation({ from, to, messageId }) {
  const sender = await getSmsSender(to);
  if (!sender.registration?.purposes?.includes('care') || await isSmsSuppressed(sender, from)) return;
  const [existing] = await pool.execute(
    `SELECT status, expires_at FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = 'care'`,
    [sender.scope, normalizeSmsPhone(from)]
  );
  if (existing[0]?.status === 'opted_out' || (existing[0]?.status === 'opted_in' && !existing[0].expires_at)) return;
  await recordSmsPermission({ scope: sender.scope, phone: from, purpose: 'care', status: 'opted_in',
    evidence: { source: 'inbound_conversation', messageId: messageId || null, numberId: sender.id },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
}

export async function processSmsKeyword({ from, to, body, messageId, receivedAt = Date.now(), sendReply }) {
  const text = String(body || '').trim().toUpperCase();
  const keyword = ['NOREMIND', 'NOPROVIDER', 'NOEXCHANGE', 'NOCHECKIN', 'NOCLIENTS', 'NOPOLLS'].includes(text) ? text : parseSmsKeyword(body);
  if (!keyword) return false;
  const sender = await getSmsSender(to);
  const phone = normalizeSmsPhone(from);
  const registration = sender.registration;
  if (keyword === 'NOPROVIDER' && registration?.provider !== 'notifyre') return false;
  if (keyword === 'NOREMIND' && registration?.provider !== 'notifyre' && !registration?.purposes?.includes('workforce')) return false;
  if (keyword === 'NOCLIENTS' && registration?.provider !== 'notifyre') return false;
  if (keyword === 'NOEXCHANGE' && !registration?.purposes?.some(p => ['workforce', 'polling'].includes(p))) return false;
  if (keyword === 'NOCHECKIN' && !registration?.purposes?.includes('workforce')) return false;
  if (keyword === 'NOPOLLS' && !registration?.purposes?.includes('polling')) return false;
  const brand = registration?.brandName || sender.agency_name || 'AuricWell';
  const contact = registration?.supportContact || sender.support_phone;
  const evidence = { source: `inbound_${keyword.toLowerCase()}`, messageId: messageId || null, numberId: sender.id };
  let consentDb;
  let locked = false;
  const lockName = contactReminderConsentLock(sender, phone);
  if (registration?.provider === 'notifyre' && ['START', 'STOP', 'NOREMIND', 'NOPROVIDER'].includes(keyword)) {
    consentDb = await pool.getConnection();
    const [[lock]] = await consentDb.execute('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) { consentDb.release(); throw smsPolicyError('sms_consent_busy', 'Retry the text consent event.'); }
  }
  try {
  let reply;
  const wasStopped = keyword === 'START' ? await isSmsSuppressed(sender, phone) : false;
  let categoryRestart = false;
  if (consentDb && ['STOP','START'].includes(keyword)
      && (keyword === 'STOP' || (!validateSmsRegistration(registration).length && registration.allowRestart === true))) {
    await consentDb.beginTransaction();
    try {
      const applied = await applyNotifyreAccountCommand({phone, keyword, at:receivedAt}, consentDb);
      await consentDb.commit();
      if (!applied) return true;
    } catch (error) { await consentDb.rollback(); throw error; }
  }
  if (keyword === 'NOPOLLS') {
    const changed = await recordSmsPermission({ scope: sender.scope, phone, purpose: 'polling', status: 'opted_out',
      evidence: { ...evidence, collectedAt: new Date(receivedAt).toISOString() } });
    if (!changed || await isSmsSuppressed(sender, phone)) return true;
    reply = `${brand}: Poll texts are off. Your other staff notifications and in-app polls are unchanged. You can re-enable poll texts in your communication settings.`;
  } else if (keyword === 'NOCLIENTS') {
    const changed = await setProviderRelayPreference({ sender, phone, enabled: false,
      evidence: { ...evidence, collectedAt: new Date(receivedAt).toISOString() } });
    if (!changed || await isSmsSuppressed(sender, phone)) return true;
    reply = `${brand}: Client text forwarding to this phone is off. Your in-app messages and other text choices are unchanged. Reply START to restore previously consented categories.`;
  } else if (keyword === 'NOCHECKIN') {
    const changed = await setCheckinSmsPreference({ agencyId: sender.agency_id, phone, enabled: false,
      evidence: { ...evidence, collectedAt: new Date(receivedAt).toISOString() } });
    if (!changed || await isSmsSuppressed(sender, phone)) return true;
    reply = `${brand}: Check-in reminders from this agency are off. Email, in-app alerts and other text choices are unchanged. Reply START to restore previously consented text categories, or use your communication settings.`;
  } else if (keyword === 'NOEXCHANGE') {
    const changed = await setExchangeSmsPreference({ agencyId: sender.agency_id, phone, enabled: false,
      evidence: { ...evidence, collectedAt: new Date(receivedAt).toISOString() } });
    if (!changed || await isSmsSuppressed(sender, phone)) return true;
    reply = `${brand}: Client Exchange texts from this agency are off. Email and other text choices are unchanged. Reply START to restore your previously consented text categories, or use your communication settings. Reply STOP to stop all texts or HELP for help.`;
  } else if (keyword === 'NOREMIND' && registration?.provider !== 'notifyre') {
    if (await isSmsSuppressed(sender, phone)) return true;
    const changed = await pauseStaffReminderTexts({ agencyId: sender.agency_id, phone, evidence: { ...evidence, collectedAt: new Date(receivedAt).toISOString() } });
    if (!changed) return true;
    reply = `${brand}: Meeting and supervision reminder texts are off. Your other text choices are unchanged. Reply START to restore previously consented text categories, or use your notification settings.`;
  } else if (['NOREMIND','NOPROVIDER'].includes(keyword)) {
    const declinedPurpose = keyword === 'NOREMIND' ? 'reminders' : 'care';
    await consentDb.beginTransaction();
    try {
      const changed = await declineNotifyrePurpose({scope:sender.scope,phone,purpose:declinedPurpose,evidence:{...evidence,collectedAt:new Date(receivedAt).toISOString()}},consentDb);
      await consentDb.commit();
      if (!changed) return true;
    } catch (error) { await consentDb.rollback(); throw error; }
    // It is a category command, not a conversation for staff to answer.
    // No confirmation may bypass an account-wide STOP.
    if (await isSmsSuppressed(sender, phone)) return true;
    reply = `${brand}: ${keyword === 'NOREMIND' ? 'Appointment text reminders are off. Your provider texting choice is unchanged.' : 'Provider texts are off. Your appointment reminder choice is unchanged.'} Reply START to restore previously consented text categories, or use your notification settings. Reply STOP to stop all texts or HELP for help.`;
  } else if (keyword === 'STOP') {
    const changed = await recordSmsPermission({ scope: sender.scope, phone, purpose: 'suppression', status: 'opted_out',
      evidence:{...evidence,providerNoticeRequested:true,agencyId:sender.agency_id,senderNumber:sender.phone_number,provider:registration?.provider||'vonage'} });
    const { applyContactReminderSmsKeyword } = await import('./contactReminderSmsConsent.service.js');
    if (registration?.provider === 'notifyre') await cancelPendingRelayReplies(phone);
    await applyContactReminderSmsKeyword({ sender, phone, keyword, messageId });
    if (!changed) return true;
    reply = `${brand}: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.`;
  } else if (keyword === 'START') {
    // Reopening a suppression does not grant consent for marketing or any new purpose.
    // Only a registered, documented re-opt-in flow can clear it.
    if (!validateSmsRegistration(registration).length && registration.allowRestart === true) {
      const restored = [];
      const changed = await recordSmsPermission({ scope: sender.scope, phone, purpose: 'suppression', status: 'opted_in', evidence,
        onRecorded: async db => {
          if (!wasStopped) {
            categoryRestart = true;
            if (registration.purposes.includes('workforce') && await restartCheckinSms({ sender, phone, evidence }, db)) restored.push('kiosk_arrivals');
            if (registration.purposes.includes('workforce') && await restartExchangeSms({ sender, phone, evidence }, db)) restored.push('exchange_matches');
            if (registration.purposes.includes('workforce') && await restartStaffReminderTexts({ sender, phone, evidence }, db)) restored.push('staff_reminders');
            if (registration.provider === 'notifyre') {
            for (const purpose of ['reminders','care'].filter(p => registration.purposes.includes(p))) {
              if (await restartNotifyrePurpose({ scope: sender.scope, phone, purpose, evidence }, db)) restored.push(purpose === 'care' ? 'conversations' : purpose);
            }
            if (registration.provider === 'notifyre' && await restartProviderRelay({ sender, phone, evidence }, db)) restored.push('client_forwarding');
            }
          }
        }
      });
      if (!changed) return true;
      await recordSmsPermission({ scope: `number:${sender.id}`, phone, purpose: 'suppression', status: 'opted_in', evidence });
      const { applyContactReminderSmsKeyword } = await import('./contactReminderSmsConsent.service.js');
      if (!await notifyrePurposeOptedOut(sender.scope,phone,'reminders')) await applyContactReminderSmsKeyword({ sender, phone, keyword, messageId });
      reply = categoryRestart ? categoryRestartMessage(brand, restored) : `${brand}: Texting is re-enabled for your existing subscriptions. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.`;
    } else {
      reply = `${brand}: To subscribe, contact ${contact || 'your practice through its website'}. Reply STOP to opt out.`;
    }
  } else {
    reply = `${brand}: For help, contact ${contact || 'your practice through its website'}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.`;
  }
  const applicationHelp = keyword === 'HELP' && registration?.helpKeywordOwner === 'application';
  const replyOwner = keyword === 'HELP' ? registration?.helpKeywordOwner || registration?.keywordOwner : registration?.keywordOwner;
  if (applicationHelp || categoryRestart || ['NOREMIND', 'NOPROVIDER', 'NOEXCHANGE', 'NOCHECKIN', 'NOCLIENTS', 'NOPOLLS'].includes(keyword) || !['vonage', 'notifyre'].includes(replyOwner)) {
    const capability = { to: phone, from: sender.phone_number, body: reply,
      ...((categoryRestart || ['NOREMIND', 'NOPROVIDER', 'NOEXCHANGE', 'NOCHECKIN', 'NOCLIENTS', 'NOPOLLS'].includes(keyword)) ? { categoryReply: true } : {}) };
    controlReplies.add(capability);
    const send = () => sendReply({ ...capability, complianceReply: capability });
    if (applicationHelp) await sendApplicationHelpReply({ sender, recipient: phone, body: reply, messageId, send });
    else await send();
  }
  return true;
  } finally {
    if (consentDb) { try { if (locked) await consentDb.execute('SELECT RELEASE_LOCK(?)', [lockName]); } finally { consentDb.release(); } }
  }
}
