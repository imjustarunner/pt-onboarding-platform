import pool from '../config/database.js';
import { normalizeCustomSessionReminders } from './appointmentNotificationCustomization.service.js';
import { APP_SESSION_REMINDERS } from './sessionReminderPolicy.js';

export async function readSessionReminderDefaults(agencyId, userId = 0, db = pool) {
  let rows;
  try { [rows] = await db.execute('SELECT rules_json FROM session_reminder_defaults WHERE agency_id=? AND user_id=?', [agencyId, userId]); }
  catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return null; throw error; }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return normalizeCustomSessionReminders(typeof row.rules_json === 'string' ? JSON.parse(row.rules_json) : row.rules_json);
}
export async function saveSessionReminderDefaults(agencyId, userId, input, actorUserId, db = pool) {
  const rules = normalizeCustomSessionReminders(input);
  if (!rules.length) throw Object.assign(new Error('Choose at least one reminder for your default.'), { status: 400 });
  await db.execute(`INSERT INTO session_reminder_defaults (agency_id,user_id,rules_json,updated_by_user_id)
    VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rules_json=VALUES(rules_json),updated_by_user_id=VALUES(updated_by_user_id)`,
  [agencyId, userId, JSON.stringify(rules), actorUserId]);
  if(Number(userId)===0) await db.execute(`INSERT INTO session_reminder_policy_rebuilds (appointment_id)
    SELECT id FROM appointments WHERE agency_id=? AND notification_mode='default' AND start_at>UTC_TIMESTAMP()
      AND status IN ('scheduled','confirmed','client_confirmed') AND COALESCE(product_origin,'')<>'auricwell_ehr'
    ON DUPLICATE KEY UPDATE status='pending',attempts=0,error_code=NULL`,[agencyId]);
  return rules;
}
export function organizationReminderRules(tenant = {}, saved = null) {
  if (saved) return saved;
  const standard = tenant.standardReminder || {};
  const extras = (tenant.additionalReminders || []).filter(rule => rule.enabled !== false);
  const customLegacy = standard.enabled === false || Number(standard.offsetValue ?? 24) !== 24
    || (standard.offsetUnit || 'hours') !== 'hours' || standard.message || extras.length
    || JSON.stringify([...(standard.channels || [standard.channel || 'email'])].sort()) !== '["email"]';
  if (!customLegacy) return APP_SESSION_REMINDERS.map(rule => ({ ...rule, channels: [...rule.channels] }));
  const minutes = rule => Number(rule.offsetValue ?? 24) * (rule.offsetUnit === 'days' ? 1440 : rule.offsetUnit === 'minutes' ? 1 : 60);
  const legacyRules = [
    ...(standard.enabled === false ? [] : [{ id: 'organization-standard', channels: standard.channels || [standard.channel || 'email'], offsetMinutes: minutes(standard), message: standard.message || '', askConfirmation: standard.askConfirmation !== false }]),
    ...extras.map((rule, index) => ({ id: `organization-${index}`, channels: rule.channels || [rule.channel || 'email'], offsetMinutes: minutes(rule), message: rule.message || '', askConfirmation: rule.askConfirmation !== false }))
  ].map(rule => ({...rule,channels:rule.channels.filter(channel=>['email','sms','in_app'].includes(channel))}))
    .filter(rule=>rule.channels.length && Number.isInteger(rule.offsetMinutes) && rule.offsetMinutes>=5 && rule.offsetMinutes<=10080);
  return normalizeCustomSessionReminders(legacyRules);
}
