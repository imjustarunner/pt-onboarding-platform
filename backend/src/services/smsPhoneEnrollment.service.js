import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { validateSmsRegistration } from '../utils/smsCompliancePolicy.js';
import { contactReminderConsentLock } from '../utils/contactReminderConsent.js';
import { notifyrePhoneStopped, notifyrePurposeOptedOut } from './notifyreRecipientState.service.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const seal = value => JSON.stringify(encryptChatText(JSON.stringify(value)));
const open = value => JSON.parse(decryptChatText(typeof value === 'string' ? JSON.parse(value) : value));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

export function approvedStartEnrollment(registration) {
  const flow = registration?.startEnrollment;
  if (registration?.provider !== 'notifyre' || registration.allowRestart !== true || validateSmsRegistration(registration).length
      || flow?.enabled !== true || !String(flow.approvalReference || '').trim() || !String(flow.version || '').trim()
      || !String(flow.disclosure || '').trim() || !Array.isArray(flow.purposes) || !flow.purposes.length
      || flow.purposes.some(p => !['care', 'reminders', 'billing'].includes(p) || !registration.purposes.includes(p))
      || new Set(flow.purposes).size !== flow.purposes.length) return null;
  return { version: flow.version, approvalReference: flow.approvalReference, disclosure: flow.disclosure, purposes: flow.purposes,
    privacyUrl: registration.privacyUrl, termsUrl: registration.termsUrl };
}

/** Only called by the authenticated carrier keyword path, under its phone lock.
 * Capturing a START is not a permission grant or a guardian/account association. */
export async function capturePhoneEnrollmentCommand({ sender, phone, keyword, messageId, receivedAt }, db) {
  if (sender.registration?.provider !== 'notifyre' || !['START', 'STOP'].includes(keyword)) return;
  const normalized = normalizeSmsPhone(phone);
  if (!normalized || !messageId || !Number.isFinite(receivedAt) || receivedAt <= 0 || receivedAt > Date.now() + 300000) fail(400, 'A dated carrier event is required for phone enrollment.');
  const flow = approvedStartEnrollment(sender.registration), phoneHash = hash(normalized);
  const payload = { agencyId: sender.agency_id, scope: sender.scope, phone: normalized, numberId: sender.id, messageId, receivedAt,
    disclosure: flow, disclosureHash: flow ? hash(JSON.stringify(flow)) : null };
  await db.beginTransaction();
  try {
    await db.execute(`INSERT IGNORE INTO sms_phone_enrollments
      (agency_id,scope_key,phone_hash,phone_last_four,number_id,status,command_at,payload_json) VALUES (?,?,?,?,?,'pending',0,?)`,
      [sender.agency_id, sender.scope, phoneHash, normalized.slice(-4), sender.id, seal(payload)]);
    const [[row]] = await db.execute('SELECT id,status,command_at FROM sms_phone_enrollments WHERE agency_id=? AND scope_key=? AND phone_hash=? FOR UPDATE', [sender.agency_id, sender.scope, phoneHash]);
    const eventKey = hash(`${sender.agency_id}:${sender.scope}:${phoneHash}:${messageId}:${keyword}`);
    const [event] = await db.execute('INSERT IGNORE INTO sms_phone_enrollment_events (enrollment_id,event_key,keyword,command_at,payload_json) VALUES (?,?,?,?,?)', [row.id, eventKey, keyword, receivedAt, seal(payload)]);
    if (event.affectedRows && (receivedAt > Number(row.command_at) || (receivedAt === Number(row.command_at) && keyword === 'STOP'))) {
      // A new affirmative START needs a fresh identity review. Never move a link silently.
      await db.execute(`UPDATE sms_phone_enrollments SET status=?,command_at=?,number_id=?,payload_json=?,
        linked_user_id=NULL,linked_client_id=NULL,reviewed_by_user_id=NULL,reviewed_at=NULL WHERE id=?`,
        [keyword === 'STOP' ? 'stopped' : 'pending', receivedAt, sender.id, seal(payload), row.id]);
    }
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
}

export async function listPhoneEnrollments(agencyId, { beforeId = null, status = 'pending' } = {}) {
  if (!['pending', 'linked', 'stopped'].includes(status) || (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1))) fail(400, 'Choose a valid queue status and cursor.');
  const [rows] = await pool.execute(`SELECT id,phone_last_four,number_id,status,command_at,payload_json,linked_user_id,linked_client_id
    FROM sms_phone_enrollments WHERE agency_id=? AND status=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT 100`, [agencyId, status, beforeId, beforeId]);
  const items = rows.map(row => {
    const evidence = open(row.payload_json);
    if (Number(evidence.agencyId) !== agencyId) throw new Error('Phone enrollment evidence context does not match.');
    return { id: row.id, phoneLastFour: row.phone_last_four, numberId: row.number_id, status: row.status, receivedAt: row.command_at,
      eligibleForReview: !!evidence.disclosure, userId: row.linked_user_id, clientId: row.linked_client_id };
  });
  return { items, nextBeforeId: items.length === 100 ? items.at(-1).id : null };
}

export async function phoneEnrollmentEvidence(agencyId, id) {
  const [[row]] = await pool.execute('SELECT payload_json FROM sms_phone_enrollments WHERE agency_id=? AND id=?', [agencyId, id]);
  if (!row) fail(404, 'Phone enrollment not found.');
  const evidence = open(row.payload_json);
  if (Number(evidence.agencyId) !== agencyId) throw new Error('Phone enrollment evidence context does not match.');
  return evidence;
}

export async function reviewPhoneEnrollment({ agencyId, id, userId, clientId, identityVerified, actorUserId }, dbPool = pool) {
  if (identityVerified !== true || ![id, userId, clientId].every(n => Number.isSafeInteger(n) && n > 0)) fail(400, 'Verify the recipient identity, current guardian authority and intended chart.');
  const { getSmsSender, isSmsSuppressed } = await import('./smsCompliance.service.js');
  const initial = await phoneEnrollmentEvidence(agencyId, id);
  const [[number]] = await dbPool.execute('SELECT phone_number FROM twilio_numbers WHERE id=? AND agency_id=?', [initial.numberId, agencyId]);
  if (!number) fail(409, 'The enrolled sender is no longer available.');
  const sender = await getSmsSender(number.phone_number), db = await dbPool.getConnection();
  const lockName = contactReminderConsentLock(sender, initial.phone);
  let locked = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,5) AS acquired', [lockName]);
    if (!Number(lock?.acquired)) fail(409, 'Consent is changing. Refresh and retry.');
    locked = true;
    await db.beginTransaction();
    const [[row]] = await db.execute('SELECT * FROM sms_phone_enrollments WHERE agency_id=? AND id=? FOR UPDATE', [agencyId, id]);
    if (!row || row.status !== 'pending') fail(409, 'This enrollment is no longer pending.');
    const evidence = open(row.payload_json), flow = approvedStartEnrollment(sender.registration);
    if (Number(evidence.agencyId) !== agencyId || evidence.scope !== sender.scope || row.scope_key !== evidence.scope || row.phone_hash !== hash(evidence.phone) || Number(sender.agency_id) !== agencyId
        || !flow || hash(JSON.stringify(flow)) !== evidence.disclosureHash) fail(409, 'The approved START disclosure changed or is missing. Collect current consent through the existing signed workflow.');
    if (await notifyrePhoneStopped(evidence.phone, db) || await isSmsSuppressed(sender, evidence.phone)) fail(409, 'STOP remains in force. Only the recipient can restart texting.');
    const [[recipient]] = await db.execute(`SELECT u.id,u.phone_number,u.personal_phone,u.work_phone FROM users u JOIN clients c ON c.agency_id=? AND c.id=?
      WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND ((u.role='client' AND c.user_id=u.id) OR (u.role IN ('client_guardian','guardian') AND EXISTS
        (SELECT 1 FROM client_guardians cg WHERE cg.client_id=c.id AND cg.guardian_user_id=u.id AND cg.access_enabled=1
        AND COALESCE(LOWER(JSON_UNQUOTE(JSON_EXTRACT(cg.permissions_json,'$.noView'))),'false') NOT IN ('true','1')
        AND COALESCE(LOWER(JSON_UNQUOTE(JSON_EXTRACT(cg.permissions_json,'$.noViewOtherGuardian'))),'false') NOT IN ('true','1')))) LIMIT 1`, [agencyId, clientId, userId]);
    if (!recipient || ![recipient.phone_number, recipient.personal_phone, recipient.work_phone].some(phone => normalizeSmsPhone(phone) === evidence.phone)) fail(409, 'The current authorized recipient and saved phone must match. Resolve shared or changed numbers in the chart first.');
    for (const purpose of flow.purposes) {
      if (await notifyrePurposeOptedOut(sender.scope, evidence.phone, purpose, db)) fail(409, 'A separate category opt-out remains. Review the recipient’s current choices first.');
    }
    // Permission writes and the reviewed link are one transaction. Original evidence is immutable.
    for (const purpose of flow.purposes) {
      const details = JSON.stringify({ source: 'inbound_start_reviewed', reference: `phone_enrollment:${id}`, messageId: evidence.messageId,
        disclosure: flow.disclosure, disclosureVersion: flow.version, collectedAt: new Date(evidence.receivedAt).toISOString(), actorUserId, userId, clientId });
      await db.execute(`INSERT INTO sms_recipient_permissions (scope_key,phone,purpose,status,evidence_json)
        VALUES (?,?,?,'opted_in',?) ON DUPLICATE KEY UPDATE status='opted_in',evidence_json=VALUES(evidence_json),expires_at=NULL`, [sender.scope, evidence.phone, purpose, details]);
      await db.execute(`INSERT INTO sms_permission_events (scope_key,phone,purpose,status,evidence_json,provider_message_id)
        VALUES (?,?,?,'opted_in',?,?)`, [sender.scope, evidence.phone, purpose, details, `phone-enrollment:${id}:${evidence.messageId}`.slice(0,100)]);
    }
    await db.execute('UPDATE sms_phone_enrollments SET status=\'linked\',linked_user_id=?,linked_client_id=?,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP(3) WHERE id=?', [userId, clientId, actorUserId, id]);
    const reviewKey = hash(`review:${id}:${evidence.messageId}:${userId}:${clientId}`);
    await db.execute('INSERT INTO sms_phone_enrollment_events (enrollment_id,event_key,keyword,command_at,payload_json) VALUES (?,?,\'REVIEW\',?,?)', [id, reviewKey, Date.now(), seal({ ...evidence, actorUserId, userId, clientId })]);
    await db.commit();
    return { id, status: 'linked', purposes: flow.purposes, userId, clientId };
  } catch (error) { await db.rollback(); throw error; }
  finally { try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]); } finally { db.release(); } }
}
