import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { guardianReminderPreferences } from './guardianAppointments.service.js';
import { getSmsSender, isSmsSuppressed, recordedReminderConsent, resolveRegisteredSmsSender } from './smsCompliance.service.js';
import { createSmsConsentRequest } from './smsConsentRequest.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

async function setupContext(userId, clientId) {
  const preferences = await guardianReminderPreferences({ userId, clientId });
  const contacts = await ClientGuardian.listForClient(clientId);
  const contact = contacts.find(c => Number(c.guardian_user_id) === Number(userId));
  const phone = normalizeSmsPhone(contact?.phone);
  const agencyId = preferences.agencyId;
  const from = await resolveRegisteredSmsSender({ agencyId, purpose: 'reminders' });
  const sender = from ? await getSmsSender(from) : null;
  return { preferences, contact, phone, agencyId, sender };
}

export async function guardianNotificationSetup({ userId, clientId }) {
  const { preferences, phone, agencyId, sender } = await setupContext(userId, clientId);
  let smsStatus = 'needs_consent';
  if (!phone) smsStatus = 'needs_phone';
  else if (!sender) smsStatus = 'unavailable';
  else if (await isSmsSuppressed(sender, phone)) smsStatus = 'stopped';
  else if (await recordedReminderConsent(agencyId, phone)) smsStatus = 'enrolled';
  else {
    const [rows] = await pool.execute(`SELECT id FROM sms_consent_requests
      WHERE agency_id = ? AND number_id = ? AND phone = ? AND created_by_user_id = ?
        AND signed_at IS NOT NULL AND activation_json IS NULL AND expires_at > UTC_TIMESTAMP()
      ORDER BY id DESC LIMIT 1`, [agencyId, sender.id, phone, userId]);
    if (rows.length) smsStatus = 'awaiting_review';
  }
  return { preferences, smsStatus, phoneLastFour: phone?.slice(-4) || null,
    complete: preferences.isDefault === false && (preferences.channels?.sms !== true || smsStatus === 'enrolled') };
}

export async function beginGuardianSmsConsent({ userId, clientId }) {
  const { preferences, contact, phone, agencyId, sender } = await setupContext(userId, clientId);
  if (preferences.channels?.sms !== true) throw Object.assign(new Error('Save your text reminder preference first.'), { status: 409 });
  if (!phone || !sender) throw Object.assign(new Error('Ask your care team to check your phone number and text enrollment availability.'), { status: 409 });
  if (await isSmsSuppressed(sender, phone)) throw Object.assign(new Error('Texts are stopped. Contact your care team for help with the program’s re-enrollment instructions.'), { status: 409 });
  return createSmsConsentRequest({ agencyId, numberId: sender.id, phone,
    signerRole: contact?.relationship_type === 'self' ? 'client' : 'guardian', actorUserId: userId });
}
