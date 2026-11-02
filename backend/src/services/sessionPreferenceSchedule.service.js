import pool from '../config/database.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../utils/zonedWallTime.util.js';

const key = row => JSON.stringify([row.channel, row.kind, row.rule_key]);

/** Only future reminder deliveries for the person who changed preferences.
 * Booking confirmations, provider notices and other recipients are excluded. */
export function preferenceReminderRows(plan, { clientId, guardianUserId = null, now = Date.now() }) {
  const start = new Date(utcMysqlToIso(plan.appointment?.startAt) || plan.start || NaN);
  const desired = new Map();
  for (const d of plan.deliveries || []) {
    if (!['standard_reminder', 'additional_reminder'].includes(d.kind)
        || d.sendImmediately || d.recipientRole === 'provider' || d.recipientAffiliationId
        || Number(d.recipientClientId) !== Number(clientId)
        || Number(d.recipientGuardianUserId || 0) !== Number(guardianUserId || 0)) continue;
    const when = new Date(start.getTime() - Number(d.offsetMinutes || 0) * 60000);
    if (!Number.isFinite(when.getTime()) || when.getTime() <= now) continue;
    const row = { channel: d.channel === 'in_app' ? 'email' : d.channel,
      kind: d.channel === 'in_app' ? `${d.kind}:in_app` : d.kind,
      rule_key: d.ruleKey, scheduled_for: dateToMysqlUtcDateTime(when),
      offset_minutes: Number(d.offsetMinutes || 0), requires_confirmation: d.requiresConfirmation ? 1 : 0,
      template_key: d.templateKey || null, is_required: d.isRequired ? 1 : 0, message_body: d.messageBody || null };
    desired.set(key(row), row);
  }
  return [...desired.values()];
}

export function reconcilePreferenceReminderRows(existing, desired) {
  const updates = [], inserts = [], cancelIds = [], retained = new Set();
  for (const row of desired) {
    const matches = existing.filter(old => key(old) === key(row));
    // Never replay a previously attempted delivery as a side effect of Save.
    if (matches.some(old => ['sent', 'failed', 'skipped'].includes(old.status))) continue;
    const pending = matches.find(old => old.status === 'pending');
    if (pending) { updates.push({ ...row, id: pending.id }); retained.add(pending.id); }
    else inserts.push(row);
  }
  for (const row of existing) if (row.status === 'pending' && !retained.has(row.id)) cancelIds.push(row.id);
  return { updates, inserts, cancelIds };
}

export async function refreshClientSessionNotifications(agencyId, clientId, guardianUserId = null, {
  db = pool,
  getPlan = async id => (await import('./sessionNotification.service.js')).buildDeliveryPlan(id),
  now = () => Date.now()
} = {}) {
  const [appointments] = await db.execute(`SELECT DISTINCT a.id FROM appointments a
    JOIN appointment_participants p ON p.appointment_id = a.id
    WHERE a.agency_id = ? AND p.client_id = ? AND a.start_at > UTC_TIMESTAMP()
      AND a.status NOT IN ('completed', 'no_show', 'rescheduled', 'draft')
      AND a.status NOT LIKE '%cancel%'
      AND (a.product_origin IS NULL OR a.product_origin <> 'auricwell_ehr')`, [agencyId, clientId]);
  for (const appointment of appointments) {
    const connection = await db.getConnection();
    const locks = [];
    let transaction = false;
    const acquire = async name => {
      const [[r]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [name]);
      if (!Number(r?.acquired)) throw Object.assign(new Error('Reminder scheduling is busy. Your choices were saved; retry Save to finish updating future reminders.'), { status: 503 });
      locks.push(name);
    };
    try {
      await acquire(`session_schedule:${appointment.id}`);
      const plan = await getPlan(appointment.id);
      if (Number(plan.appointment?.agencyId) !== Number(agencyId)) continue;
      // Old cadence rows expand into a child for each guardian at delivery time.
      // Reserve only this guardian's child so that expansion cannot recreate an
      // obsolete schedule after Save; other recipients keep the parent cadence.
      const [legacy] = guardianUserId ? await connection.execute(`SELECT * FROM appointment_reminders
        WHERE appointment_id = ? AND agency_id = ? AND status = 'pending' AND scheduled_for > UTC_TIMESTAMP()
          AND (recipient_client_id = ? OR recipient_client_id IS NULL)
          AND recipient_guardian_user_id IS NULL AND recipient_affiliation_id IS NULL
          AND recipient_role = 'client' AND kind IN ('reminder','standard_reminder','additional_reminder')`,
      [appointment.id, agencyId, clientId]) : [[]];
      for (const row of legacy) await acquire(`session_reminder:${row.id}`);
      const [existing] = await connection.execute(`SELECT * FROM appointment_reminders
        WHERE appointment_id = ? AND agency_id = ?
          AND (recipient_client_id = ? OR recipient_client_id IS NULL)
          AND recipient_guardian_user_id <=> ? AND recipient_affiliation_id IS NULL
          AND recipient_role IN ('client','guardian')
          AND kind IN ('reminder', 'standard_reminder', 'additional_reminder', 'standard_reminder:in_app', 'additional_reminder:in_app')`,
      [appointment.id, agencyId, clientId, Number(guardianUserId) || null]);
      for (const row of existing.filter(r => r.status === 'pending')) await acquire(`session_reminder:${row.id}`);
      await connection.beginTransaction(); transaction = true;
      for (const row of legacy) await connection.execute(`INSERT IGNORE INTO appointment_reminders
        (appointment_id,agency_id,channel,kind,rule_key,recipient_role,offset_minutes,scheduled_for,
          recipient_guardian_user_id,recipient_client_id,parent_reminder_id,status,skip_reason)
        VALUES (?,?,?,?,?,'guardian',?,?,?,?,?,'canceled','preferences_changed')`,
      [appointment.id, agencyId, row.channel, row.kind, row.rule_key, row.offset_minutes || 0,
        row.scheduled_for, Number(guardianUserId), clientId, row.id]);
      // A worker may have finished while we waited for its lock.
      const [current] = existing.length ? await connection.execute(
        `SELECT * FROM appointment_reminders WHERE id IN (${existing.map(() => '?').join(',')}) FOR UPDATE`, existing.map(r => r.id)) : [[]];
      const change = reconcilePreferenceReminderRows(current, preferenceReminderRows(plan, { clientId, guardianUserId, now: now() }));
      for (const id of change.cancelIds) await connection.execute("UPDATE appointment_reminders SET status='canceled', skip_reason='preferences_changed' WHERE id=? AND status='pending'", [id]);
      for (const row of change.updates) await connection.execute(`UPDATE appointment_reminders
        SET scheduled_for=?, offset_minutes=?, requires_confirmation=?, template_key=?, is_required=?, message_body=?
        WHERE id=? AND status='pending'`, [row.scheduled_for, row.offset_minutes, row.requires_confirmation, row.template_key, row.is_required, row.message_body, row.id]);
      for (const row of change.inserts) await connection.execute(`INSERT INTO appointment_reminders
        (appointment_id,agency_id,channel,kind,rule_key,recipient_role,requires_confirmation,template_key,
          is_required,message_body,offset_minutes,scheduled_for,recipient_guardian_user_id,recipient_client_id,status)
        VALUES (?,?,?,?,?,'client',?,?,?,?,?,?,?,?,'pending')`,
      [appointment.id, agencyId, row.channel, row.kind, row.rule_key, row.requires_confirmation,
        row.template_key, row.is_required, row.message_body, row.offset_minutes, row.scheduled_for, Number(guardianUserId) || null, clientId]);
      await connection.commit(); transaction = false;
    } catch (cause) {
      if (transaction) await connection.rollback();
      throw Object.assign(new Error('Your notification choices were saved, but future reminders could not be updated. Retry Save to finish the update.'), { code: 'REMINDER_PREFERENCES_SYNC_FAILED', status: 503, cause });
    } finally {
      try { for (const name of locks.reverse()) await connection.execute('SELECT RELEASE_LOCK(?)', [name]); }
      finally { connection.release(); }
    }
  }
  return { appointmentsUpdated: appointments.length };
}
