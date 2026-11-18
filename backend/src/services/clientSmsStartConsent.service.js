import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { smsPolicyError, validateSmsRegistration } from '../utils/smsCompliancePolicy.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { applyNotifyreAccountCommand, notifyrePhoneKey } from './notifyreRecipientState.service.js';
import { resolveRelayFamily } from './providerSmsRelayIdentity.service.js';
import { latestIntakeCommunicationChoices } from './intakeCommunicationChoices.service.js';
import { CLIENT_START_CONSENT_VERSION, clientStartConsentNotice } from '../utils/clientSmsStartPolicy.js';

export { CLIENT_START_CONSENT_VERSION };
const purposes = ['reminders', 'care'];
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const time = value => value instanceof Date ? +value : Date.parse(utcMysqlToIso(value) || value);

export function clientStartPurposes(sender) {
  const registration = sender.registration;
  return registration?.provider === 'notifyre' && registration.allowRestart === true
    && registration.startEnrollment == null
    && !validateSmsRegistration(registration).length
    ? purposes.filter(purpose => registration.purposes.includes(purpose)) : [];
}

// Only called with a dated, authenticated carrier webhook, inside the same
// transaction as the account START. Unknown phones keep their grant here; no
// client account, guardian relationship or human audit actor is invented.
export async function recordClientSmsStart({ sender, phone, messageId, receivedAt }, db) {
  const enabled = clientStartPurposes(sender);
  const recipient = normalizeSmsPhone(phone);
  if (!enabled.length || !recipient || !messageId || !Number.isFinite(receivedAt)) {
    throw smsPolicyError('sms_start_evidence_required', 'A registered program and authenticated, dated START receipt are required.');
  }
  if (!await applyNotifyreAccountCommand({ phone: recipient, keyword: 'START', at: receivedAt }, db)) {
    const [[state]] = await db.execute('SELECT blocked,command_at FROM auricwell_sms_phone_state WHERE phone_key=? FOR UPDATE', [notifyrePhoneKey(recipient)]);
    // Different programs can receive START within the same carrier timestamp.
    // Deduplicate by provider event below; a STOP always wins a timestamp tie.
    if (Number(state?.blocked) === 1 || Number(state?.command_at) !== receivedAt) return false;
  }
  const evidence = {
    source: 'inbound_start', reference: `notifyre:${messageId}`, messageId, numberId: sender.id,
    agencyId: Number(sender.agency_id), campaignId: sender.campaign_id,
    collectedAt: new Date(receivedAt).toISOString(), expiresAt: null,
    version: CLIENT_START_CONSENT_VERSION,
    purposes: enabled,
    disclosure: `${sender.registration.brandName}: ${clientStartConsentNotice(sender.registration)} Message frequency varies. Message and data rates may apply. HELP for help.`,
    termsUrl: sender.registration.termsUrl, privacyUrl: sender.registration.privacyUrl
  };
  let changed = false;
  for (const [scope, purpose] of [
    [sender.scope, 'suppression'], [`number:${sender.id}`, 'suppression'],
    ...enabled.map(purpose => [sender.scope, purpose])
  ]) {
    const details = JSON.stringify(evidence);
    const [event] = await db.execute(`INSERT IGNORE INTO sms_permission_events
      (scope_key,phone,purpose,status,evidence_json,provider_message_id) VALUES (?,?,?,'opted_in',?,?)`,
    [scope, recipient, purpose, details, messageId]);
    if (!event.affectedRows) continue;
    changed = true;
    // A delayed webhook must not replace a later form or category decision.
    const [[current]] = await db.execute(`SELECT evidence_json,updated_at FROM sms_recipient_permissions
      WHERE scope_key=? AND phone=? AND purpose=? FOR UPDATE`, [scope, recipient, purpose]);
    const currentEvidence = parse(current?.evidence_json);
    if (current && currentEvidence?.source !== 'inbound_conversation'
        && time(currentEvidence?.collectedAt || current.updated_at) >= receivedAt) continue;
    await db.execute(`INSERT INTO sms_recipient_permissions (scope_key,phone,purpose,status,evidence_json,expires_at)
      VALUES (?,?,?,'opted_in',?,NULL) ON DUPLICATE KEY UPDATE status='opted_in',
      evidence_json=VALUES(evidence_json),expires_at=NULL,updated_at=CURRENT_TIMESTAMP`, [scope, recipient, purpose, details]);
  }
  return changed;
}

export async function clientSmsStartRecipients({ agencyId, phone, clientId = null }, db = pool) {
  const normalized = normalizeSmsPhone(phone);
  if (!normalized) return [];
  const digits = normalized.slice(1), local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const [clients] = await db.execute(`SELECT c.id,c.agency_id,c.contact_phone,c.compliance_archived_at,c.status
    FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id
    WHERE (c.agency_id=? OR EXISTS (SELECT 1 FROM client_agency_assignments ca
      WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))
      AND (? IS NULL OR c.id=?) AND c.compliance_archived_at IS NULL
      AND UPPER(COALESCE(c.status,'')) NOT IN ('ARCHIVED','TERMINATED','DELETED','DEAD','INACTIVE','DISCHARGED')
      AND LOWER(COALESCE(s.status_key,'')) NOT IN ('terminated','archived','dead')
      AND LOWER(COALESCE(s.label,'')) NOT LIKE '%terminated%'
      AND (REGEXP_REPLACE(COALESCE(c.contact_phone,''),'[^0-9]','') IN (?,?)
        OR EXISTS (SELECT 1 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
          WHERE cg.client_id=c.id AND REGEXP_REPLACE(COALESCE(NULLIF(u.phone_number,''),NULLIF(u.personal_phone,''),u.work_phone,''),'[^0-9]','') IN (?,?)))`,
  [agencyId, agencyId, clientId, clientId, digits, local, digits, local]);
  const recipients = [];
  for (const client of clients) {
    // Existing identity policy rejects revoked/ambiguous guardian links instead
    // of falling back to an old copy of that guardian's phone on the chart.
    const family = await resolveRelayFamily(client, normalized);
    if (family) recipients.push({ clientId: client.id, guardianUserId: family.guardianUserId || null });
  }
  return recipients;
}

// Read through the phone grant whenever preferences are displayed or a message
// is sent. This covers future enrollment and phone/relationship changes without
// copying stale opt-in flags onto charts or depending on a periodic backfill.
export async function clientSmsStartAllowed({ sender, phone, purpose, evidence, clientId = null, recipientUserId = null }, db = pool) {
  if (evidence?.source !== 'inbound_start' || evidence.version !== CLIENT_START_CONSENT_VERSION
      || Number(evidence.agencyId) !== Number(sender.agency_id) || evidence.campaignId !== sender.campaign_id
      || !evidence.messageId || !evidence.purposes?.includes(purpose) || !purposes.includes(purpose)) return false;
  const grantedAt = time(evidence.collectedAt);
  if (!Number.isFinite(grantedAt) || grantedAt > Date.now() + 300000) return false;
  const recipients = await clientSmsStartRecipients({ agencyId: sender.agency_id, phone, clientId }, db);
  const matching = recipientUserId ? recipients.filter(r => Number(r.guardianUserId) === Number(recipientUserId)) : recipients;
  if (!matching.length) return false;
  for (const recipient of matching) {
    const cp = await latestIntakeCommunicationChoices(recipient.clientId, sender.agency_id, recipient.guardianUserId);
    const own = cp && (normalizeSmsPhone(cp.recipientPhone) === normalizeSmsPhone(phone)
      || (recipient.guardianUserId && Number(cp.guardianUserId) === Number(recipient.guardianUserId))
      || (!recipient.guardianUserId && !cp.guardianUserId));
    const declined = purpose === 'reminders' ? cp?.smsPreference === 'no' : cp?.providerTextingOptIn === 'no';
    if (own && declined && (!Number.isFinite(time(cp.signedAt || cp.submittedAt)) || time(cp.signedAt || cp.submittedAt) >= grantedAt)) return false;
    if (purpose === 'reminders') {
      const [[preference]] = await db.execute(`SELECT channels_json,updated_at FROM client_session_notification_preferences
        WHERE agency_id=? AND client_id=? AND guardian_user_id=?`, [sender.agency_id, recipient.clientId, recipient.guardianUserId || 0]);
      if (preference && parse(preference.channels_json)?.sms === false
          && (!Number.isFinite(time(preference.updated_at)) || time(preference.updated_at) >= grantedAt)) return false;
    }
  }
  return true;
}

export async function refreshClientSmsStartReminders({ sender, phone }) {
  const { refreshClientSessionNotifications } = await import('./sessionPreferenceSchedule.service.js');
  for (const recipient of await clientSmsStartRecipients({ agencyId: sender.agency_id, phone })) {
    await refreshClientSessionNotifications(sender.agency_id, recipient.clientId, recipient.guardianUserId);
  }
}
