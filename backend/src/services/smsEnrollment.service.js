import pool from '../config/database.js';
import { getSmsSender, recordSmsPermission, isSmsSuppressed } from './smsCompliance.service.js';
import { smsPolicyError, validateSmsRegistration, validateSmsConsentEvidence } from '../utils/smsCompliancePolicy.js';
import { staffCommunicationKey } from '../utils/staffCommunicationChoices.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

export async function enrollSmsRecipient({ from, phone, purpose, status, evidence, actorUserId, sendConfirmation }) {
  const errors = validateSmsConsentEvidence({ purpose, status, evidence });
  if (errors.length) throw smsPolicyError('sms_consent_evidence_required', errors.join('; '));
  if (status === 'opted_in' && !sendConfirmation) throw new Error('Enrollment requires a confirmation sender');
  const sender = await getSmsSender(from);
  if (validateSmsRegistration(sender.registration).length || !sender.registration.purposes.includes(purpose)) {
    throw smsPolicyError('sms_campaign_not_ready', 'Configure an approved campaign for this purpose first');
  }
  if (status === 'opted_in' && await isSmsSuppressed(sender, phone)) {
    throw smsPolicyError('sms_opted_out', 'A saved form or staff edit cannot clear STOP; the recipient must use the registered re-opt-in flow');
  }
  let staffNotificationKind = 'notifications';
  if (status === 'opted_in' && purpose === 'workforce') {
    const digits = normalizeSmsPhone(phone)?.slice(1);
    const local = digits?.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    const [staff] = await pool.execute(`SELECT JSON_EXTRACT(p.notification_categories, ?) AS notifications_enabled
      FROM users u JOIN user_agencies ua ON ua.user_id = u.id JOIN user_preferences p ON p.user_id = u.id
      WHERE ua.agency_id = ? AND (REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?))`,
      [`$.${staffCommunicationKey(sender.agency_id)}.choices.notifications`, sender.agency_id, digits, local, digits, local, digits, local]);
    // A staff member may choose message alerts without general notifications.
    // The delivery gate still checks the selected category and phone fingerprint.
    if (staff.some(row => ![true, 1, 'true'].includes(row.notifications_enabled))) staffNotificationKind = 'messageAlerts';
  }
  await recordSmsPermission({ scope: sender.scope, phone, purpose, status,
    evidence: { ...evidence, source: evidence?.source || 'recorded_opt_out', actorUserId } });
  if (status === 'opted_in') {
    if (!sendConfirmation) throw new Error('Enrollment requires a confirmation sender');
    const descriptions = { care: 'care-team messages', reminders: 'appointment reminders', workforce: 'workforce notifications', billing: 'billing-account notifications', marketing: 'optional program offers', account_security: 'account security messages', polling: 'optional polls and surveys' };
    try {
      await sendConfirmation({ to: phone, from: sender.phone_number, purpose, agencyId: sender.agency_id, staffNotificationKind,
        body: `You subscribed to ${descriptions[purpose]}. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.` });
    } catch (error) {
      await recordSmsPermission({ scope: sender.scope, phone, purpose, status: 'opted_out',
        evidence: { source: 'confirmation_failed', reference: evidence.reference, actorUserId } });
      throw error;
    }
  }
  return { status, purpose };
}

export async function saveSmsRegistration({ numberId, registration, actorUserId }) {
  // Saving a disabled registration is how an operator immediately stops traffic
  // after a carrier suspension. Delivery still requires both flags to be true.
  const errors = validateSmsRegistration(registration).filter((error) => error !== 'Carrier approval and number linking must be verified');
  if (errors.length) throw smsPolicyError('sms_registration_invalid', errors.join('; '));
  const [numbers] = await pool.execute('SELECT id, agency_id FROM twilio_numbers WHERE id = ? AND is_active = TRUE', [numberId]);
  if (!numbers[0]) throw smsPolicyError('sms_unknown_sender', 'Number not found');
  const [conflicts] = await pool.execute(
    `SELECT r.number_id FROM sms_sender_registrations r JOIN twilio_numbers n ON n.id = r.number_id
     WHERE (r.campaign_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(r.registration_json, '$.brandId')) <> ?)
        OR ((r.campaign_id = ? OR JSON_UNQUOTE(JSON_EXTRACT(r.registration_json, '$.brandId')) = ?)
            AND NOT (n.agency_id <=> ?))
     LIMIT 1`, [registration.campaignId, registration.brandId, registration.campaignId, registration.brandId, numbers[0].agency_id]
  );
  if (conflicts.length) throw smsPolicyError('sms_cross_tenant_campaign', 'A campaign cannot be shared across independent agencies or brands');
  const [peers] = await pool.execute('SELECT registration_json FROM sms_sender_registrations WHERE campaign_id = ? AND number_id <> ?', [registration.campaignId, numberId]);
  const program = (value) => JSON.stringify([
    ...['brandId', 'brandName', 'legalName', 'resellerId', 'website', 'privacyUrl', 'termsUrl', 'supportContact', 'keywordOwner'].map((key) => value[key]),
    value.allowRestart === true, [...value.purposes].sort()
  ]);
  if (peers.some((peer) => program(typeof peer.registration_json === 'string' ? JSON.parse(peer.registration_json) : peer.registration_json) !== program(registration))) {
    throw smsPolicyError('sms_campaign_inconsistent', 'All numbers on a campaign must use the same identity, purposes, policies and keyword behavior');
  }
  const [existing] = await pool.execute('SELECT campaign_id FROM sms_sender_registrations WHERE number_id = ?', [numberId]);
  if (existing[0] && existing[0].campaign_id !== registration.campaignId) {
    throw smsPolicyError('sms_campaign_migration_required', 'Changing campaigns requires explicit suppression migration; automatic relinking is disabled');
  }
  await pool.execute(
    `INSERT INTO sms_sender_registrations (number_id, campaign_id, registration_json, updated_by_user_id)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE registration_json = VALUES(registration_json),
     updated_by_user_id = VALUES(updated_by_user_id)`,
    [numberId, registration.campaignId, JSON.stringify(registration), actorUserId]
  );
}
