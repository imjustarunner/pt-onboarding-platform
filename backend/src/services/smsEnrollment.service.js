import pool from '../config/database.js';
import { getSmsSender, recordSmsPermission, isSmsSuppressed } from './smsCompliance.service.js';
import { smsPolicyError, validateSmsRegistration, validateSmsConsentEvidence } from '../utils/smsCompliancePolicy.js';
import { staffCommunicationKey, staffDeliveryKinds } from '../utils/staffCommunicationChoices.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

async function prepareEnrollment({ from, phone, purpose, status, evidence, actorUserId }) {
  const errors = validateSmsConsentEvidence({ purpose, status, evidence });
  if (errors.length) throw smsPolicyError('sms_consent_evidence_required', errors.join('; '));
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
    const [staff] = await pool.execute(`SELECT JSON_EXTRACT(p.notification_categories, ?) AS staff_choices
      FROM users u JOIN user_agencies ua ON ua.user_id = u.id JOIN user_preferences p ON p.user_id = u.id
      WHERE ua.agency_id = ? AND (REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?))`,
      [`$.${staffCommunicationKey(sender.agency_id)}.choices`, sender.agency_id, digits, local, digits, local, digits, local]);
    // A staff member may choose message alerts without general notifications.
    // The delivery gate still checks the selected category and phone fingerprint.
    // No saved preference is different from an explicit opt-out. A separately
    // reviewed signed consent may activate staff without account preferences.
    const states=staff.map(row=>typeof row.staff_choices==='string'?JSON.parse(row.staff_choices):row.staff_choices)
      .filter(state=>state!=null);
    if (states.length) {
      const kind=staffDeliveryKinds(states[0]||{}).find(key=>states.every(choices=>choices?.[key]===true));
      if (!kind) throw smsPolicyError('sms_staff_choice_off','No enabled staff text category matches this phone');
      staffNotificationKind=kind;
    }
  }
  return { sender, phone, purpose, status, evidence, actorUserId, staffNotificationKind };
}

export async function enrollSmsRecipientBatch({ from, phone, enrollments, actorUserId, sendConfirmation }) {
  if (!Array.isArray(enrollments) || new Set(enrollments.map(e => e.purpose)).size !== enrollments.length) {
    throw smsPolicyError('sms_consent_evidence_required', 'Each message type must have one signed choice');
  }
  if (enrollments.some(e => e.status === 'opted_in') && !sendConfirmation) throw new Error('Enrollment requires a confirmation sender');
  const prepared = [];
  for (const enrollment of enrollments) prepared.push(await prepareEnrollment({ ...enrollment, from, phone, actorUserId }));
  if (new Set(prepared.map(e => e.sender.scope)).size > 1) throw smsPolicyError('sms_campaign_changed', 'The campaign changed during enrollment; retry review');
  const accepted = prepared.filter(e => e.status === 'opted_in');
  const granted = [];
  let confirmationMessageId = null;
  try {
    for (const entry of prepared) {
      await recordSmsPermission({ scope: entry.sender.scope, phone, purpose: entry.purpose, status: entry.status,
        evidence: { ...entry.evidence, source: entry.evidence?.source || 'recorded_opt_out', actorUserId } });
      if (entry.status === 'opted_in') granted.push(entry);
    }
    if (accepted.length) {
      const first = accepted.find(e => e.purpose === 'workforce') || accepted[0];
      const brand = first.sender.registration?.brandName || first.sender.agency_name || 'AuricWell';
      const restart = first.sender.registration?.allowRestart === true ? ' START to restart.' : '';
      const sent = await sendConfirmation({ to: phone, from: first.sender.phone_number, purpose: first.purpose,
        agencyId: first.sender.agency_id, staffNotificationKind: first.staffNotificationKind,
        confirmationPurposes: accepted.map(e => e.purpose),
        body: `${brand}: Selected texts are on. Frequency varies. Message and data rates may apply. STOP to stop, HELP for help.${restart}` });
      confirmationMessageId = sent?.sid || null;
    }
  } catch (error) {
    // If the single confirmation fails, none of its newly accepted types remain active.
    for (const entry of granted) await recordSmsPermission({ scope: entry.sender.scope, phone, purpose: entry.purpose, status: 'opted_out',
      evidence: { source: 'confirmation_failed', reference: entry.evidence.reference, actorUserId } });
    throw error;
  }
  return prepared.map(({status, purpose}) => ({ status, purpose, confirmationMessageId: status === 'opted_in' ? confirmationMessageId : null }));
}

export async function enrollSmsRecipient({ purpose, status, evidence, ...options }) {
  const [result] = await enrollSmsRecipientBatch({ ...options, enrollments: [{purpose, status, evidence}] });
  return result;
}

export async function saveSmsRegistration({ numberId, registration, actorUserId }) {
  // Saving a disabled registration is how an operator immediately stops traffic
  // after a carrier suspension. Delivery still requires both flags to be true.
  const errors = validateSmsRegistration(registration).filter((error) => error !== 'Carrier approval and number linking must be verified');
  if (errors.length) throw smsPolicyError('sms_registration_invalid', errors.join('; '));
  const [numbers] = await pool.execute('SELECT id, agency_id FROM twilio_numbers WHERE id = ? AND is_active = TRUE', [numberId]);
  if (!numbers[0]) throw smsPolicyError('sms_unknown_sender', 'Number not found');
  const [conflicts] = await pool.execute(
    `SELECT r.number_id, n.agency_id, JSON_UNQUOTE(JSON_EXTRACT(r.registration_json, '$.brandId')) AS brand_id FROM sms_sender_registrations r JOIN twilio_numbers n ON n.id = r.number_id
     WHERE (r.campaign_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(r.registration_json, '$.brandId')) <> ?)
        OR ((r.campaign_id = ? OR JSON_UNQUOTE(JSON_EXTRACT(r.registration_json, '$.brandId')) = ?)
            AND NOT (n.agency_id <=> ?))
     `, [registration.campaignId, registration.brandId, registration.campaignId, registration.brandId, numbers[0].agency_id]
  );
  if (conflicts.length) {
    // This owner-approved QA workspace belongs to ITSCO itself. Its record access
    // remains isolated; only the exact ITSCO service sender may share the brand.
    const [[agency]] = await pool.execute('SELECT id, slug, feature_flags FROM agencies WHERE id = ?', [numbers[0].agency_id]);
    const flags = typeof agency?.feature_flags === 'string' ? JSON.parse(agency.feature_flags) : agency?.feature_flags;
    const sameItscoBusiness = Number(numberId) === 2 && isAuricwellQaAgency(agency)
      && flags?.qaSandbox?.smsSponsorAgencyId === 2
      && registration.brandId === 'BRC2ZW3' && registration.campaignId === 'VCV2DNM4'
      && conflicts.every(row => Number(row.agency_id) === 2 && row.brand_id === registration.brandId);
    if (!sameItscoBusiness) throw smsPolicyError('sms_cross_tenant_campaign', 'A campaign cannot be shared across independent agencies or brands');
  }
  const [peers] = await pool.execute('SELECT registration_json FROM sms_sender_registrations WHERE campaign_id = ? AND number_id <> ?', [registration.campaignId, numberId]);
  const program = (value) => JSON.stringify([
    ...['provider', 'brandId', 'brandName', 'legalName', 'resellerId', 'website', 'privacyUrl', 'termsUrl', 'supportContact', 'keywordOwner'].map((key) => value[key]),
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
