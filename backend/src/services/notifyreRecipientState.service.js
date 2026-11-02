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

// A category decline is separate from account STOP. START never writes it.
// An affirmative, reviewed category enrollment can replace the decline.
export async function notifyrePurposeOptedOut(scope, phone, purpose, db = pool) {
  const [[row]] = await db.execute(`SELECT status FROM sms_recipient_permissions
    WHERE scope_key=? AND phone=? AND purpose=? LIMIT 1`, [scope, normalizeSmsPhone(phone), purpose]);
  return row?.status === 'opted_out';
}

export async function declineNotifyrePurpose({ scope, phone, purpose, evidence }, db) {
  const recipient = normalizeSmsPhone(phone), details = JSON.stringify(evidence);
  const [event] = await db.execute(`INSERT IGNORE INTO sms_permission_events (scope_key,phone,purpose,status,evidence_json,provider_message_id)
    VALUES (?,?,?,'opted_out',?,?)`, [scope, recipient, purpose, details, evidence.messageId || null]);
  if (!event.affectedRows) return false;
  await db.execute(`INSERT INTO sms_recipient_permissions (scope_key,phone,purpose,status,evidence_json)
    VALUES (?,?,?,'opted_out',?) ON DUPLICATE KEY UPDATE status='opted_out',evidence_json=VALUES(evidence_json),expires_at=NULL`,
  [scope, recipient, purpose, details]);
  return true;
}
