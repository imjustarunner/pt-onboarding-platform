import pool from '../config/database.js';
import { normalizeCustomSessionReminders } from '../../../frontend/src/navigation/sessionReminderRules.js';
export { normalizeCustomSessionReminders };

export async function readAppointmentNotificationRules(appointmentId, agencyId, db = pool) {
  const [[row]] = await db.execute('SELECT rules_json FROM appointment_notification_customizations WHERE appointment_id=? AND agency_id=?', [appointmentId, agencyId]);
  const rules = typeof row?.rules_json === 'string' ? JSON.parse(row.rules_json) : row?.rules_json;
  return normalizeCustomSessionReminders(rules || []);
}
export async function saveAppointmentNotificationRules(appointmentId, agencyId, input, actorUserId, db = pool) {
  const rules = normalizeCustomSessionReminders(input);
  if (!rules.length) {
    await db.execute('DELETE FROM appointment_notification_customizations WHERE appointment_id=? AND agency_id=?', [appointmentId, agencyId]);
    return rules;
  }
  await db.execute(`INSERT INTO appointment_notification_customizations (appointment_id,agency_id,rules_json,updated_by_user_id)
    SELECT id,agency_id,?,? FROM appointments WHERE id=? AND agency_id=?
    ON DUPLICATE KEY UPDATE rules_json=VALUES(rules_json),updated_by_user_id=VALUES(updated_by_user_id)`, [JSON.stringify(rules), actorUserId || null, appointmentId, agencyId]);
  return rules;
}

export async function validateCustomReminderChannels(agencyId, rules) {
  if (!rules.length) return;
  const { getTenantSettings, resolveEffectiveChannels } = await import('./sessionNotification.service.js');
  const settings = await getTenantSettings(agencyId);
  const available = resolveEffectiveChannels(settings.platform, settings.channelsEnabled);
  for (const rule of rules) for (const channel of rule.channels || [rule.channel]) if (!available[channel]) throw Object.assign(new Error(`The ${channel === 'sms' ? 'text' : channel} notification channel is not enabled for this agency.`), { status: 400 });
}
