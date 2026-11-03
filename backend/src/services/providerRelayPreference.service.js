import pool from '../config/database.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

const purpose = 'client_forwarding';
export async function cancelPendingRelayReplies(phone, db = pool) {
  await db.execute(`UPDATE provider_sms_relay_replies r JOIN provider_sms_relay_enrollments e ON e.id=r.enrollment_id
    SET r.status='cancelled' WHERE e.phone=? AND r.status='awaiting_confirmation'`, [normalizeSmsPhone(phone)]);
}
export async function providerRelayOptedOut({ agencyId, phone }, db = pool) {
  const [rows] = await db.execute('SELECT status FROM sms_recipient_permissions WHERE scope_key=? AND phone=? AND purpose=? LIMIT 1',
    [`agency:${Number(agencyId)}`, normalizeSmsPhone(phone), purpose]);
  return rows[0]?.status === 'opted_out';
}
export async function setProviderRelayPreference({ sender, phone, enabled, evidence }, database = null) {
  const recipient = normalizeSmsPhone(phone);
  if (!recipient || !sender?.agency_id || !evidence?.source) throw new Error('Relay preference evidence is required');
  const db = database || await pool.getConnection();
  try {
    if (!database) await db.beginTransaction();
    const [enrollments] = await db.execute('SELECT id FROM provider_sms_relay_enrollments WHERE agency_id=? AND phone=?', [sender.agency_id, recipient]);
    if (!enrollments.length) { if (!database) await db.commit(); return false; }
    const values = [`agency:${Number(sender.agency_id)}`, recipient, purpose, enabled ? 'opted_in' : 'opted_out', JSON.stringify(evidence)];
    const [event] = await db.execute(`INSERT IGNORE INTO sms_permission_events (scope_key,phone,purpose,status,evidence_json,provider_message_id)
      VALUES (?,?,?,?,?,?)`, [...values, evidence.messageId || null]);
    if (!event.affectedRows) { if (!database) await db.commit(); return false; }
    await db.execute(`INSERT INTO sms_recipient_permissions (scope_key,phone,purpose,status,evidence_json,expires_at)
      VALUES (?,?,?,?,?,NULL) ON DUPLICATE KEY UPDATE status=VALUES(status),evidence_json=VALUES(evidence_json),expires_at=NULL,updated_at=CURRENT_TIMESTAMP`, values);
    if (!enabled) await db.execute(`UPDATE provider_sms_relay_replies r JOIN provider_sms_relay_enrollments e ON e.id=r.enrollment_id
      SET r.status='cancelled' WHERE e.agency_id=? AND e.phone=? AND r.status='awaiting_confirmation'`, [sender.agency_id,recipient]);
    if (!database) await db.commit();
    return true;
  } catch (error) { if (!database) await db.rollback(); throw error; }
  finally { if (!database) db.release(); }
}
export async function restartProviderRelay({ sender, phone, evidence }, db = pool) {
  if (!await providerRelayOptedOut({ agencyId: sender.agency_id, phone }, db)) return false;
  // START restores only an existing, still-enabled enrollment and its care grant.
  // It never enables app access or enrolls a new phone/provider.
  const [rows] = await db.execute(`SELECT e.id FROM provider_sms_relay_enrollments e
    JOIN users u ON u.id=e.provider_user_id AND u.is_active=TRUE
    JOIN user_preferences prefs ON prefs.user_id=u.id AND prefs.sms_enabled=TRUE AND prefs.sms_forwarding_enabled=TRUE
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=e.agency_id AND ua.is_active=TRUE
    JOIN sms_recipient_permissions p ON p.phone=e.phone AND p.scope_key=? AND p.purpose='care'
      AND p.status='opted_in' AND (p.expires_at IS NULL OR p.expires_at>UTC_TIMESTAMP())
    WHERE e.agency_id=? AND e.phone=? AND e.enabled=TRUE
      AND REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?) LIMIT 1`,
    [sender.scope,sender.agency_id,normalizeSmsPhone(phone),normalizeSmsPhone(phone).slice(1),normalizeSmsPhone(phone).slice(-10)]);
  if (!rows.length) return false;
  return setProviderRelayPreference({ sender, phone, enabled: true, evidence }, db === pool ? null : db);
}
