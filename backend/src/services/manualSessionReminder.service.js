import pool from '../config/database.js';
import { withSessionSchedulingLock } from './sessionSchedulingLock.service.js';
import { utcMysqlToIso, dateToMysqlUtcDateTime } from '../utils/zonedWallTime.util.js';

export const EXTRA_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const instant = value => new Date(utcMysqlToIso(value) || value);
const eligible = appointment => appointment && appointment.productOrigin !== 'auricwell_ehr' && ['scheduled', 'confirmed', 'client_confirmed'].includes(appointment.status);
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

export function createManualSessionReminders({ db = pool, clock = () => new Date(), lock = withSessionSchedulingLock } = {}) {
  async function state(appointment, executor = db) {
    const [rows] = await executor.execute(`SELECT * FROM appointment_reminders WHERE appointment_id=? ORDER BY scheduled_for,id`, [appointment.id]);
    const manual = rows.filter(row => row.rule_key === 'manual_extra' && ['pending', 'sent', 'canceled'].includes(row.status));
    const latest = Math.max(0, ...manual.map(row => +instant(row.created_at)));
    const next = latest ? latest + EXTRA_REMINDER_COOLDOWN_MS : 0;
    const pending = manual.some(row => row.status === 'pending');
    return {
      items: rows.map(row => ({ id: Number(row.id), kind: row.kind, channel: row.channel, status: row.status,
        scheduledFor: utcMysqlToIso(row.scheduled_for), sentAt: utcMysqlToIso(row.sent_at),
        bodyPreview: row.message_body || '', description: row.error_message || row.skip_reason || '',
        recipientUserId: row.recipient_guardian_user_id || null })),
      canSendAdditionalReminder: eligible(appointment) && +instant(appointment.startAt) > +clock() && !pending && next <= +clock(),
      additionalReminderAvailableAt: next ? new Date(next).toISOString() : null,
      additionalReminderPending: pending
    };
  }
  async function queue(appointment, buildPlan, actorUserId) {
    return lock(appointment.id, async () => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const current = await state(appointment, conn);
        if (!current.canSendAdditionalReminder) throw fail(409,
          current.additionalReminderPending ? 'An additional reminder is already queued.' : 'Additional reminders are limited to once every 24 hours for an upcoming session.',
          { availableAt: current.additionalReminderAvailableAt });
        const plan = await buildPlan(appointment.id);
        if (!eligible(plan.appointment) || +instant(plan.appointment.startAt) <= +clock()) throw fail(409, 'Additional reminders are available only for upcoming sessions.');
        const seen = new Set();
        const deliveries = (plan.deliveries || []).filter(item => {
          if (item.kind === 'confirmation' || item.recipientRole === 'provider') return false;
          const key = JSON.stringify([item.channel, item.recipientGuardianUserId || 0, item.recipientClientId || plan.clientId || 0, item.recipientAffiliationId || 0]);
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
        if (!deliveries.length) throw fail(409, 'No permitted reminder channel is available for this session.');
        const scheduledFor = dateToMysqlUtcDateTime(new Date(+clock() + 1000));
        for (const item of deliveries) {
          await conn.execute(`INSERT INTO appointment_reminders
            (appointment_id,agency_id,channel,kind,rule_key,recipient_role,requires_confirmation,template_key,is_required,message_body,offset_minutes,scheduled_for,recipient_guardian_user_id,recipient_client_id,recipient_affiliation_id,status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
          [appointment.id, appointment.agencyId, item.channel === 'in_app' ? 'email' : item.channel,
            item.channel === 'in_app' ? 'additional_reminder:in_app' : 'additional_reminder', 'manual_extra', item.recipientRole || 'client',
            item.requiresConfirmation ? 1 : 0, item.templateKey || null, 0, null, 0, scheduledFor,
            item.recipientGuardianUserId || null, item.recipientClientId || plan.clientId || null, item.recipientAffiliationId || null]);
        }
        await conn.execute(`INSERT INTO appointment_communications
          (appointment_id,agency_id,direction,channel,kind,body_preview,metadata_json,created_by_user_id)
          VALUES (?,?,'system','in_app','additional_reminder',?,?,?)`,
        [appointment.id, appointment.agencyId, `Additional reminder queued for ${deliveries.length} delivery channel(s).`, JSON.stringify({ count: deliveries.length, deliveryStatus: 'queued' }), actorUserId]);
        await conn.commit();
        return { queued: deliveries.length, additionalReminderAvailableAt: new Date(+clock() + EXTRA_REMINDER_COOLDOWN_MS).toISOString() };
      } catch (error) { await conn.rollback(); throw error; }
      finally { conn.release(); }
    });
  }
  return { state, queue };
}
export default createManualSessionReminders();
