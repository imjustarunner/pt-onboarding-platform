import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { staffCommunicationKey, phoneFingerprint } from '../utils/staffCommunicationChoices.js';

// A category preference, never a grant of workforce/campaign consent. Scope it
// to the agency and phone so changing the notification sender cannot undo it.
const purpose = 'exchange_matches';
function identity(agencyId, phone) {
  const recipient = normalizeSmsPhone(phone);
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1 || !recipient) return null;
  return { scope: `agency:${Number(agencyId)}`, recipient };
}

export async function exchangeSmsOptedOut({ agencyId, phone }, db = pool) {
  const target = identity(agencyId, phone);
  if (!target) return false;
  const [rows] = await db.execute(
    'SELECT status FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = ? LIMIT 1',
    [target.scope, target.recipient, purpose]
  );
  return rows[0]?.status === 'opted_out';
}

export async function setExchangeSmsPreference({ agencyId, phone, enabled, evidence }, database = null) {
  const target = identity(agencyId, phone);
  if (!target || typeof enabled !== 'boolean' || !evidence?.source) throw new Error('Valid Exchange text preference evidence is required');
  const db = database || await pool.getConnection();
  try {
    if (!database) await db.beginTransaction();
    const status = enabled ? 'opted_in' : 'opted_out';
    const details = JSON.stringify(evidence);
    // Insert the event first: replaying a webhook must neither repeat the reply
    // nor overwrite a later, deliberately signed preference change.
    const [event] = await db.execute(
      `INSERT IGNORE INTO sms_permission_events (scope_key, phone, purpose, status, evidence_json, provider_message_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [target.scope, target.recipient, purpose, status, details, evidence.messageId || null]
    );
    if (event.affectedRows === 0) {
      if (!database) await db.commit();
      return false;
    }
    await db.execute(
      `INSERT INTO sms_recipient_permissions (scope_key, phone, purpose, status, evidence_json, expires_at)
       VALUES (?, ?, ?, ?, ?, NULL) ON DUPLICATE KEY UPDATE status = VALUES(status),
       evidence_json = VALUES(evidence_json), expires_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      [target.scope, target.recipient, purpose, status, details]
    );
    if (!database) await db.commit();
    return true;
  } catch (error) {
    if (!database) await db.rollback();
    throw error;
  } finally {
    if (!database) db.release();
  }
}

export async function restartExchangeSms({ sender, phone, evidence }, db = pool) {
  if (!await exchangeSmsOptedOut({ agencyId: sender.agency_id, phone }, db)) return false;
  const digits = normalizeSmsPhone(phone).slice(1), local = digits.length === 11 ? digits.slice(1) : digits;
  const [staff] = await db.execute(`SELECT JSON_EXTRACT(p.notification_categories, ?) AS choices
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id JOIN user_preferences p ON p.user_id=u.id
    LEFT JOIN user_notification_type_preferences t ON t.user_id=u.id AND t.notification_type='client_exchange_match'
    WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(t.sms_enabled,1)=1
      AND REGEXP_REPLACE(COALESCE(NULLIF(u.personal_phone,''),NULLIF(u.work_phone,''),u.phone_number,''),'[^0-9]','') IN (?,?)`,
  [`$.${staffCommunicationKey(sender.agency_id)}`, sender.agency_id, digits, local]);
  if (!staff.length || !staff.every(row => {
    const state = typeof row.choices === 'string' ? JSON.parse(row.choices) : row.choices;
    return state?.phoneHash === phoneFingerprint(normalizeSmsPhone(phone)) && state?.choices?.exchangeMatches === true;
  })) return false;
  // The signed category choice and current campaign grant must both survive.
  const [grants] = await db.execute(`SELECT evidence_json FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = ?
    AND status='opted_in' AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) LIMIT 1`, [sender.scope, normalizeSmsPhone(phone), 'workforce']);
  if (!grants.length) return false;
  const grant = typeof grants[0].evidence_json === 'string' ? JSON.parse(grants[0].evidence_json) : grants[0].evidence_json;
  if (String(grant?.reference || '').startsWith('staff_communications:')) return false;
  if (grant?.staffCommunicationReference && staff.some(row => {
    const state = typeof row.choices === 'string' ? JSON.parse(row.choices) : row.choices;
    return state.reference !== grant.staffCommunicationReference;
  })) return false;
  return setExchangeSmsPreference({ agencyId: sender.agency_id, phone, enabled: true, evidence }, db === pool ? null : db);
}
