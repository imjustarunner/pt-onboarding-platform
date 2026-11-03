import crypto from 'node:crypto';
import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

// Notifyre's STOP applies to the recipient across this account's numbers.
// This is the same state used by the standalone clinical messaging workspace.
export const notifyrePhoneKey = phone => crypto.createHash('sha256')
  .update(`auricwell:sms:phone:${normalizeSmsPhone(phone)}`).digest('hex');

export async function notifyrePhoneStopped(phone, db = pool) {
  const [[state]] = await db.execute('SELECT blocked FROM auricwell_sms_phone_state WHERE phone_key=?', [notifyrePhoneKey(phone)]);
  return Number(state?.blocked) === 1;
}

export async function applyNotifyreAccountCommand({ phone, keyword, at }, db) {
  if (!['STOP', 'START'].includes(keyword) || !Number.isFinite(at) || at <= 0 || at > Date.now() + 300000) {
    throw new Error('A dated Notifyre STOP or START event is required.');
  }
  const key = notifyrePhoneKey(phone);
  await db.execute('INSERT IGNORE INTO auricwell_sms_phone_state (phone_key) VALUES (?)', [key]);
  const [[state]] = await db.execute('SELECT blocked,command_at FROM auricwell_sms_phone_state WHERE phone_key=? FOR UPDATE', [key]);
  if (at < Number(state?.command_at || 0) || (at === Number(state?.command_at) && keyword === 'START')) return false;
  await db.execute('UPDATE auricwell_sms_phone_state SET blocked=?,command_at=?,updated_at=UTC_TIMESTAMP(3) WHERE phone_key=?', [keyword === 'STOP', at, key]);
  if (keyword === 'STOP') await db.execute(`UPDATE auricwell_sms_outbox o JOIN auricwell_sms_contacts c ON c.id=o.contact_id
    SET o.status='suppressed',o.updated_at=UTC_TIMESTAMP(3) WHERE c.phone_key=? AND o.status='queued'`, [key]);
  return true;
}

// A category decline is separate from account STOP. A category-only START can
// restore its original grant, but never creates consent for a new category.
export async function notifyrePurposeOptedOut(scope, phone, purpose, db = pool) {
  const [[row]] = await db.execute(`SELECT status FROM sms_recipient_permissions
    WHERE scope_key=? AND phone=? AND purpose=? LIMIT 1`, [scope, normalizeSmsPhone(phone), purpose]);
  return row?.status === 'opted_out';
}

export async function declineNotifyrePurpose({ scope, phone, purpose, evidence }, db) {
  const recipient = normalizeSmsPhone(phone);
  const [[current]] = await db.execute('SELECT status,evidence_json,expires_at FROM sms_recipient_permissions WHERE scope_key=? AND phone=? AND purpose=? FOR UPDATE', [scope, recipient, purpose]);
  const currentEvidence = typeof current?.evidence_json === 'string' ? JSON.parse(current.evidence_json) : current?.evidence_json;
  const previousGrant = current?.status === 'opted_in' ? { evidence: currentEvidence, expiresAt: current.expires_at || null } : currentEvidence?.previousGrant;
  const details = JSON.stringify({ ...evidence, ...(previousGrant ? { previousGrant } : {}) });
  const [event] = await db.execute(`INSERT IGNORE INTO sms_permission_events (scope_key,phone,purpose,status,evidence_json,provider_message_id)
    VALUES (?,?,?,'opted_out',?,?)`, [scope, recipient, purpose, details, evidence.messageId || null]);
  if (!event.affectedRows) return false;
  await db.execute(`INSERT INTO sms_recipient_permissions (scope_key,phone,purpose,status,evidence_json)
    VALUES (?,?,?,'opted_out',?) ON DUPLICATE KEY UPDATE status='opted_out',evidence_json=VALUES(evidence_json),expires_at=NULL`,
  [scope, recipient, purpose, details]);
  return true;
}

export async function restartNotifyrePurpose({ scope, phone, purpose, evidence }, db) {
  const recipient = normalizeSmsPhone(phone);
  const [[current]] = await db.execute('SELECT status,evidence_json,expires_at FROM sms_recipient_permissions WHERE scope_key=? AND phone=? AND purpose=? FOR UPDATE', [scope, recipient, purpose]);
  if (current?.status !== 'opted_out') return false;
  const decline = typeof current.evidence_json === 'string' ? JSON.parse(current.evidence_json) : current.evidence_json;
  let grant = decline?.previousGrant;
  if (!grant) {
    const [[prior]] = await db.execute(`SELECT evidence_json FROM sms_permission_events WHERE scope_key=? AND phone=? AND purpose=? AND status='opted_in' ORDER BY id DESC LIMIT 1`, [scope, recipient, purpose]);
    const saved = typeof prior?.evidence_json === 'string' ? JSON.parse(prior.evidence_json) : prior?.evidence_json;
    // Historical short-lived inquiry permission is not a subscription.
    // Older events did not always retain expiry. Do not guess that an expired
    // grant is permanent merely because it was once opted in.
    if (saved && Object.hasOwn(saved, 'expiresAt')) grant = { evidence: saved, expiresAt: saved.expiresAt };
  }
  if (!grant?.evidence?.reference || !['web_form','paper_form','preference_center','staff_verbal','inbound_start_contact_invitation'].includes(grant.evidence.source)
      || (grant.expiresAt && (!Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now()))) return false;
  const details = JSON.stringify({ ...grant.evidence, restart: evidence });
  const [event] = await db.execute(`INSERT IGNORE INTO sms_permission_events (scope_key,phone,purpose,status,evidence_json,provider_message_id)
    VALUES (?,?,?,'opted_in',?,?)`, [scope, recipient, purpose, details, evidence.messageId || null]);
  if (!event.affectedRows) return false;
  await db.execute(`UPDATE sms_recipient_permissions SET status='opted_in',evidence_json=?,expires_at=?,updated_at=CURRENT_TIMESTAMP
    WHERE scope_key=? AND phone=? AND purpose=? AND status='opted_out'`, [details, grant.expiresAt, scope, recipient, purpose]);
  return true;
}
