import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { staffCommunicationKey, phoneFingerprint } from '../utils/staffCommunicationChoices.js';

export const STAFF_REMINDER_OPT_OUT = 'Reply NOREMIND to stop reminders.';
const purpose = 'staff_reminders';
const parse = value => typeof value === 'string' ? JSON.parse(value) : (value || {});

function identity(agencyId, phone) {
  const recipient = normalizeSmsPhone(phone);
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1 || !recipient) return null;
  return { scope: `agency:${Number(agencyId)}`, recipient };
}

function phoneDigits(phone) {
  const digits = normalizeSmsPhone(phone).slice(1);
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return [digits, local];
}

export function withStaffReminderOptOut(body) {
  const text = String(body || '').trim();
  return /\bNOREMIND\b/i.test(text) ? text : `${text} ${STAFF_REMINDER_OPT_OUT}`;
}

async function matchingStaff(db, agencyId, phone) {
  const [digits, local] = phoneDigits(phone);
  const [rows] = await db.execute(
    `SELECT u.id, p.notification_categories
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? AND ua.is_active = 1
     JOIN user_preferences p ON p.user_id = u.id
     WHERE REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?)
        OR REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?)`,
    [agencyId, digits, local, digits, local, digits, local]
  );
  return rows;
}

function stateFor(row, agencyId, phone) {
  const key = staffCommunicationKey(agencyId);
  const state = parse(row.notification_categories)[key];
  if (!state?.choices) return null;
  if (state.phoneHash && state.phoneHash !== phoneFingerprint(phone)) return null;
  return { key, state };
}

async function writeChoice(db, userId, key, state) {
  await db.execute(
    `UPDATE user_preferences
     SET notification_categories = JSON_SET(COALESCE(notification_categories, JSON_OBJECT()), ?, CAST(? AS JSON))
     WHERE user_id = ?`,
    [`$.${key}`, JSON.stringify(state), userId]
  );
}

export async function pauseStaffReminderTexts({ agencyId, phone, evidence }, database = null) {
  const target = identity(agencyId, phone);
  if (!target || !evidence?.source) throw new Error('Valid staff reminder preference evidence is required');
  const db = database || await pool.getConnection();
  try {
    if (!database) await db.beginTransaction();
    const details = JSON.stringify(evidence);
    const [event] = await db.execute(
      `INSERT IGNORE INTO sms_permission_events (scope_key, phone, purpose, status, evidence_json, provider_message_id)
       VALUES (?, ?, ?, 'opted_out', ?, ?)`,
      [target.scope, target.recipient, purpose, details, evidence.messageId || null]
    );
    if (!event.affectedRows) {
      if (!database) await db.commit();
      return false;
    }
    let changed = false;
    for (const row of await matchingStaff(db, agencyId, target.recipient)) {
      const current = stateFor(row, agencyId, target.recipient);
      if (!current || current.state.choices.notifications !== true) continue;
      current.state.choices = { ...current.state.choices, notifications: false };
      current.state.reminderPause = { previous: true, source: evidence.source, at: evidence.collectedAt || new Date().toISOString() };
      await writeChoice(db, row.id, current.key, current.state);
      changed = true;
    }
    await db.execute(
      `INSERT INTO sms_recipient_permissions (scope_key, phone, purpose, status, evidence_json, expires_at)
       VALUES (?, ?, ?, 'opted_out', ?, NULL)
       ON DUPLICATE KEY UPDATE status = VALUES(status), evidence_json = VALUES(evidence_json),
         expires_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      [target.scope, target.recipient, purpose, details]
    );
    if (!database) await db.commit();
    return changed;
  } catch (error) {
    if (!database) await db.rollback();
    throw error;
  } finally {
    if (!database) db.release();
  }
}

export async function restartStaffReminderTexts({ sender, phone, evidence }, db = pool) {
  const target = identity(sender?.agency_id, phone);
  if (!target || !evidence?.source) return false;
  const [held] = await db.execute(
    `SELECT status FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = ? LIMIT 1`,
    [target.scope, target.recipient, purpose]
  );
  if (held[0]?.status !== 'opted_out') return false;
  const [grants] = await db.execute(
    `SELECT 1 FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = 'workforce'
     AND status = 'opted_in' AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1`,
    [sender.scope, target.recipient]
  );
  if (!grants.length) return false;
  let changed = false;
  for (const row of await matchingStaff(db, sender.agency_id, target.recipient)) {
    const current = stateFor(row, sender.agency_id, target.recipient);
    if (!current || current.state.reminderPause?.previous !== true) continue;
    current.state.choices = { ...current.state.choices, notifications: true };
    delete current.state.reminderPause;
    await writeChoice(db, row.id, current.key, current.state);
    changed = true;
  }
  if (!changed) return false;
  const details = JSON.stringify(evidence);
  await db.execute(
    `INSERT IGNORE INTO sms_permission_events (scope_key, phone, purpose, status, evidence_json, provider_message_id)
     VALUES (?, ?, ?, 'opted_in', ?, ?)`,
    [target.scope, target.recipient, purpose, details, evidence.messageId || null]
  );
  await db.execute(
    `UPDATE sms_recipient_permissions SET status = 'opted_in', evidence_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE scope_key = ? AND phone = ? AND purpose = ?`,
    [details, target.scope, target.recipient, purpose]
  );
  return true;
}
