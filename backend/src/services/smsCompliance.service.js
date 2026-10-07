import { staffCommunicationKey, phoneFingerprint } from '../utils/staffCommunicationChoices.js';
import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { parseSmsKeyword, SMS_PURPOSES, smsPolicyError, validateSmsRegistration, formatRegisteredSms } from '../utils/smsCompliancePolicy.js';

const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
// One-use capabilities bind an automated control reply to its exact recipient/body.
const controlReplies = new WeakSet();

export async function getSmsSender(from) {
  const phone = normalizeSmsPhone(from);
  if (!phone) throw smsPolicyError('sms_invalid_sender', 'A valid sending number is required');
  const [rows] = await pool.execute(
    `SELECT n.id, n.agency_id, n.phone_number, n.is_active, n.status,
            a.name AS agency_name, a.phone_number AS support_phone,
            r.campaign_id, r.registration_json
     FROM twilio_numbers n LEFT JOIN agencies a ON a.id = n.agency_id
     LEFT JOIN sms_sender_registrations r ON r.number_id = n.id
     WHERE n.phone_number = ? LIMIT 1`, [phone]
  );
  const row = rows[0];
  if (!row || !row.is_active || row.status === 'released') throw smsPolicyError('sms_unknown_sender', 'Sending number is not active in AuricWell');
  return { ...row, registration: row.registration_json ? json(row.registration_json) : null,
    scope: row.campaign_id ? `campaign:${row.campaign_id}` : `number:${row.id}` };
}

export async function recordSmsPermission({ scope, phone, purpose, status, evidence, expiresAt = null }) {
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

export async function prepareSmsDelivery({ to, from, body, purpose, mediaUrl, complianceReply, agencyId, staffNotificationKind = 'notifications' }) {
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
    return { to: recipient, from: sender.phone_number, body };
  }
  const registration = sender.registration;
  if (validateSmsRegistration(registration).length) throw smsPolicyError('sms_campaign_not_ready', 'SMS campaign registration and number linking must be verified before sending');
  if (!SMS_PURPOSES.includes(purpose) || !registration.purposes.includes(purpose)) {
    throw smsPolicyError('sms_campaign_purpose_mismatch', 'This sending number is not registered for the requested SMS purpose');
  }
  if (await isSmsSuppressed(sender, recipient)) throw smsPolicyError('sms_opted_out', 'Recipient has opted out of this SMS campaign');
  if (['workforce','polling'].includes(purpose)) {
    const digits=recipient.slice(1), local=digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;
    const [staff]=await pool.execute(`SELECT JSON_EXTRACT(p.notification_categories, ?) AS choices
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id JOIN user_preferences p ON p.user_id=u.id
      WHERE ua.agency_id=? AND (REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
      OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?) OR REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?))`,
      [`$.${staffCommunicationKey(sender.agency_id)}`,sender.agency_id,digits,local,digits,local,digits,local]);
    for (const row of staff) {
      const state=row.choices?json(row.choices):null;
      const kind=purpose==='polling'?'polling':staffNotificationKind;
      if(state && (state.phoneHash!==phoneFingerprint(recipient)||!['notifications','messageAlerts','polling'].includes(kind)||state.choices?.[kind]!==true))
        throw smsPolicyError('sms_staff_choice_off','This staff member has not enabled this personal-phone text category');
    }
  }
  const [permissions] = await pool.execute(
    `SELECT 1 FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = ?
     AND status = 'opted_in' AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1`,
    [sender.scope, recipient, purpose]
  );
  if (!permissions.length) throw smsPolicyError('sms_consent_required', 'Recorded recipient consent for this SMS purpose is required');
  return { to: recipient, from: sender.phone_number, body: formatRegisteredSms(body, registration.brandName) };
}

export async function resolveRegisteredSmsSender({ agencyId, purpose }) {
  if (!Number(agencyId) || !SMS_PURPOSES.includes(purpose)) return null;
  const [rows] = await pool.execute(
    `SELECT n.phone_number FROM twilio_numbers n JOIN sms_sender_registrations r ON r.number_id = n.id
     WHERE n.agency_id = ? AND n.is_active = TRUE AND n.status <> 'released'
       AND JSON_CONTAINS(JSON_EXTRACT(r.registration_json, '$.purposes'), JSON_QUOTE(?))
       AND JSON_EXTRACT(r.registration_json, '$.approved') = TRUE
       AND JSON_EXTRACT(r.registration_json, '$.numberLinked') = TRUE
     ORDER BY n.id LIMIT 1`, [Number(agencyId), purpose]
  );
  return rows[0]?.phone_number || null;
}

// Preference readers may recognize a later signed enrollment, but this lookup
// never authorizes delivery. sendSms still rechecks registration and STOP.
export async function recordedReminderConsent(agencyId, phone) {
  const normalized = normalizeSmsPhone(phone);
  if (!normalized) return null;
  const from = await resolveRegisteredSmsSender({ agencyId, purpose: 'reminders' });
  if (!from) return null;
  const sender = await getSmsSender(from);
  const [rows] = await pool.execute(`SELECT evidence_json FROM sms_recipient_permissions
    WHERE scope_key = ? AND phone = ? AND purpose = 'reminders' AND status = 'opted_in'
      AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1`, [sender.scope, normalized]);
  const evidence = rows[0]?.evidence_json ? json(rows[0].evidence_json) : null;
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

export async function processSmsKeyword({ from, to, body, messageId, sendReply }) {
  const keyword = parseSmsKeyword(body);
  if (!keyword) return false;
  const sender = await getSmsSender(to);
  const phone = normalizeSmsPhone(from);
  const registration = sender.registration;
  const brand = registration?.brandName || sender.agency_name || 'AuricWell';
  const contact = registration?.supportContact || sender.support_phone;
  const evidence = { source: `inbound_${keyword.toLowerCase()}`, messageId: messageId || null, numberId: sender.id };
  let reply;
  if (keyword === 'STOP') {
    const changed = await recordSmsPermission({ scope: sender.scope, phone, purpose: 'suppression', status: 'opted_out', evidence });
    if (!changed) return true;
    reply = `${brand}: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.`;
  } else if (keyword === 'START') {
    // Reopening a suppression does not grant consent for marketing or any new purpose.
    // Only a registered, documented re-opt-in flow can clear it.
    if (!validateSmsRegistration(registration).length && registration.allowRestart === true) {
      const changed = await recordSmsPermission({ scope: sender.scope, phone, purpose: 'suppression', status: 'opted_in', evidence });
      if (!changed) return true;
      await recordSmsPermission({ scope: `number:${sender.id}`, phone, purpose: 'suppression', status: 'opted_in', evidence });
      reply = `${brand}: Texting is re-enabled for your existing subscriptions. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.`;
    } else {
      reply = `${brand}: To subscribe, contact ${contact || 'your practice through its website'}. Reply STOP to opt out.`;
    }
  } else {
    reply = `${brand}: For help, contact ${contact || 'your practice through its website'}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.`;
  }
  if (registration?.keywordOwner !== 'vonage') {
    const capability = { to: phone, from: sender.phone_number, body: reply };
    controlReplies.add(capability);
    await sendReply({ ...capability, complianceReply: capability });
  }
  return true;
}
