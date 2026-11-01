/** A guardian can request reminders, but only the recipient's START grants SMS.
 * This fixed, one-time invitation requires permission to send the invitation.
 * It cannot send arbitrary clinical content or bypass campaign/STOP/QA gates. */
import pool from '../config/database.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import { contactReminderPhoneHash, contactReminderConsentLock } from '../utils/contactReminderConsent.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { validateSmsRegistration } from '../utils/smsCompliancePolicy.js';
import { allowQaSmsDelivery } from '../utils/auricwellQaPolicy.js';
import { getSmsSender, isSmsSuppressed, recordSmsPermission, resolveRegisteredSmsSender } from './smsCompliance.service.js';
import { sendNotifyreSms, smsTransport } from './notifyre.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const oneLine = value => String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100);
export function contactSmsInvitationText({ assignerName, agencyName, isSelf = false }) {
  return `${oneLine(agencyName) || 'Care team'}: ${oneLine(assignerName) || 'An authorized account holder'} added you to appointment reminders for ${isSelf ? 'their own appointments' : "their dependent's appointments"}. Reply START to opt in. Message frequency varies. Message and data rates may apply. STOP to stop, HELP for help.`;
}

export async function requestContactSmsInvitation({ affiliationId, clientId, userId, recipientPermissionToInvite }) {
  if (recipientPermissionToInvite !== true) throw fail(400, 'Confirm that this person agreed to receive an opt-in invitation first.');
  const { requireReminderGuardian } = await import('./clientContactAffiliation.service.js');
  await requireReminderGuardian(clientId, userId);
  const db = await pool.getConnection();
  const lockName = `contact-sms-invite:${Number(affiliationId)}`;
  let locked = false;
  let consentLocked = false;
  let consentLockName;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?, 3) AS acquired', [lockName]);
    if (Number(lock?.acquired) !== 1) throw fail(409, 'An invitation is already being processed. Refresh its status.');
    locked = true;
    let row = await ClientContactAffiliation.findById(affiliationId);
    if (!row || Number(row.client_id) !== Number(clientId) || !Number(row.is_active) || !Number(row.contact_is_active)) throw fail(404, 'Contact not found.');
    await requireReminderGuardian(clientId, row.notify_ack_by_user_id);
    if (!row.sms_reminders_enabled || !row.notify_ack_at) throw fail(409, 'Enable text reminders for this contact first.');
    if (row.sms_consent_status === 'stopped') throw fail(409, 'This contact selected STOP. Invitations cannot be resent; they must restart texting themselves.');
    if (row.sms_consent_status === 'opted_in' && row.sms_consent_phone_hash === contactReminderPhoneHash(row.contact_phone)) return { status: 'opted_in', sent: false };
    if (['sending', 'uncertain'].includes(row.sms_invitation_status)) throw fail(409, 'The previous invitation needs delivery review before another can be sent.');
    const last = row.sms_invitation_attempted_at && new Date(row.sms_invitation_attempted_at).getTime();
    if (last && Date.now() - last < 60 * 60 * 1000) throw fail(429, 'Please wait one hour before resending an invitation.');
    const phone = normalizeSmsPhone(row.contact_phone);
    if (!phone) throw fail(400, 'A valid mobile number is required.');
    const { default: Agency } = await import('../models/Agency.model.js');
    const { default: User } = await import('../models/User.model.js');
    const agency = await Agency.findById(row.agency_id);
    const assigner = await User.findById(userId);
    const from = await resolveRegisteredSmsSender({ agencyId: row.agency_id, purpose: 'reminders' });
    if (!from) return await blocked(row, 'sms_campaign_not_ready');
    const sender = await getSmsSender(from);
    if (Number(sender.agency_id) !== Number(row.agency_id) || validateSmsRegistration(sender.registration).length
        || sender.registration?.allowRestart !== true) return await blocked(row, 'sms_campaign_not_ready');
    consentLockName = contactReminderConsentLock(sender, phone);
    const [[consentLock]] = await db.execute('SELECT GET_LOCK(?, 3) AS acquired', [consentLockName]);
    if (Number(consentLock?.acquired) !== 1) throw fail(409, 'Text consent is changing. Refresh before sending an invitation.');
    consentLocked = true;
    row = await ClientContactAffiliation.findById(affiliationId);
    if (!row || Number(row.client_id) !== Number(clientId) || !Number(row.is_active) || !Number(row.contact_is_active)
        || !row.sms_reminders_enabled || normalizeSmsPhone(row.contact_phone) !== phone) throw fail(409, 'Contact details changed. Refresh before sending an invitation.');
    await requireReminderGuardian(clientId, row.notify_ack_by_user_id);
    if (row.sms_consent_status === 'stopped') throw fail(409, 'This contact selected STOP. Invitations cannot be resent.');
    if (row.sms_consent_status === 'opted_in' && row.sms_consent_phone_hash === contactReminderPhoneHash(phone)) return { status: 'opted_in', sent: false };
    if (['sending', 'uncertain'].includes(row.sms_invitation_status)) throw fail(409, 'The previous invitation needs delivery review.');
    if (await isSmsSuppressed(sender, phone)) {
      await ClientContactAffiliation.update(row.id, { smsConsentStatus: 'stopped', smsOptIn: false });
      throw fail(409, 'This contact selected STOP. Invitations cannot be resent.');
    }
    if (!allowQaSmsDelivery({ id: agency.id, slug: agency.slug, feature_flags: agency.feature_flags }, { to: phone, purpose: 'reminders', clientId })) return await blocked(row, 'sms_qa_recipient_blocked');
    const body = contactSmsInvitationText({ agencyName: agency.name, assignerName: [assigner?.first_name, assigner?.last_name].filter(Boolean).join(' '), isSelf: assigner?.role === 'client' });
    const delivery = { to: phone, from: sender.phone_number, agencyId: sender.agency_id, purpose: 'reminders', body, registration: sender.registration };
    try { smsTransport(delivery); } catch (error) { return await blocked(row, error.code || 'notifyre_not_ready'); }
    await ClientContactAffiliation.update(row.id, {
      smsSenderNumberId: sender.id, smsConsentPhoneHash: contactReminderPhoneHash(phone), smsConsentStatus: 'pending', smsOptIn: false,
      smsInvitationPermissionByUserId: userId, smsInvitationPermissionAt: new Date(),
      smsInvitationAttemptedAt: new Date(), smsInvitationStatus: 'sending', smsInvitationError: null
    });
    try {
      const receipt = await sendNotifyreSms(delivery);
      if (!receipt?.sid) throw Object.assign(new Error('Uncertain acceptance'), { code: 'notifyre_delivery_uncertain' });
      await ClientContactAffiliation.update(row.id, { smsInvitationSentAt: new Date(), smsInvitationStatus: 'sent', smsInvitationError: null });
      return { status: 'pending', sent: true };
    } catch (error) {
      const uncertain = error.code !== 'notifyre_send_rejected';
      await ClientContactAffiliation.update(row.id, { smsInvitationStatus: uncertain ? 'uncertain' : 'blocked', smsInvitationError: error.code || 'notifyre_delivery_uncertain' });
      return { status: uncertain ? 'uncertain' : 'blocked', sent: false, reason: error.code || 'notifyre_delivery_uncertain' };
    }
  } finally {
    try {
      try { if (consentLocked) await db.execute('SELECT RELEASE_LOCK(?)', [consentLockName]); }
      finally { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
    } finally { db.release(); }
  }
}
async function blocked(row, reason) {
  await ClientContactAffiliation.update(row.id, { smsInvitationStatus: 'blocked', smsInvitationError: String(reason).slice(0, 80) });
  return { status: 'blocked', sent: false, reason };
}

/** Called only after a signed carrier webhook and campaign validation. */
export async function applyContactReminderSmsKeyword({ sender, phone, keyword, messageId }) {
  if (!['START', 'STOP'].includes(keyword) || sender.registration?.provider !== 'notifyre') return 0;
  const normalized = normalizeSmsPhone(phone);
  if (!normalized) return 0;
  const digits = normalized.slice(1);
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const [rows] = await pool.execute(`SELECT a.* FROM client_contact_affiliations a
    JOIN agency_contacts c ON c.id=a.agency_contact_id
    WHERE a.agency_id=? AND c.agency_id=a.agency_id
      AND REGEXP_REPLACE(COALESCE(c.phone,''),'[^0-9]','') IN (?,?)
      AND (?='STOP' OR (a.is_active=1 AND c.is_active=1 AND a.sms_reminders_enabled=1
        AND a.sms_sender_number_id=? AND a.sms_invitation_sent_at IS NOT NULL
        AND a.sms_invitation_permission_at IS NOT NULL AND a.notify_ack_at IS NOT NULL
        AND (EXISTS (SELECT 1 FROM client_guardians cg WHERE cg.client_id=a.client_id
          AND cg.guardian_user_id=a.notify_ack_by_user_id AND cg.access_enabled=1
          AND COALESCE(JSON_EXTRACT(cg.permissions_json,'$.noView'),false)=false
          AND COALESCE(JSON_EXTRACT(cg.permissions_json,'$.noViewOtherGuardian'),false)=false)
          OR EXISTS (SELECT 1 FROM clients cl JOIN users u ON u.id=cl.user_id
            WHERE cl.id=a.client_id AND cl.user_id=a.notify_ack_by_user_id AND u.role='client' AND u.is_active=1))))`,
    [sender.agency_id, digits, local, keyword, sender.id]);
  if (keyword === 'START' && (validateSmsRegistration(sender.registration).length || sender.registration.allowRestart !== true)) return 0;
  let changed = 0;
  for (const row of rows) {
    if (keyword === 'START' && row.sms_consent_phone_hash !== contactReminderPhoneHash(normalized)) continue;
    if (keyword === 'START') {
      await recordSmsPermission({ scope: sender.scope, phone: normalized, purpose: 'reminders', status: 'opted_in',
        evidence: { source: 'inbound_start_contact_invitation', reference: `contact-affiliation:${row.id}`, messageId, numberId: sender.id, collectedAt: new Date().toISOString() } });
    }
    changed++;
    await ClientContactAffiliation.update(row.id, { smsOptIn: keyword === 'START', smsConsentStatus: keyword === 'START' ? 'opted_in' : 'stopped', smsConsentEventAt: new Date(), smsConsentMessageId: messageId || null });
  }
  return changed;
}
