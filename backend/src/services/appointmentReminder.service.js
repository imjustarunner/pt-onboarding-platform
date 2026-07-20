/**
 * Phase 4: per-appointment reminder schedule + communication timeline.
 * Email is standard; SMS/phone only when consent is documented (never silent opt-in).
 */

import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import TenantService from '../models/TenantService.model.js';
import User from '../models/User.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import EmailService from './email.service.js';
import VonageService from './vonage.service.js';
import { resolveReminderNumber } from './communicationRouting.service.js';

const DEFAULT_REMINDERS = [
  { channel: 'email', offsetMinutes: 1440 },
  { channel: 'email', offsetMinutes: 120 }
];

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function toMysqlDateTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseStartAt(startAt) {
  if (!startAt) return null;
  if (startAt instanceof Date) return startAt;
  const s = String(startAt).trim();
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getAgencyReminderDefaults(agencyId) {
  try {
    const [rows] = await pool.execute(
      `SELECT reminder_defaults_json FROM booking_agency_settings WHERE agency_id = ? LIMIT 1`,
      [Number(agencyId)]
    );
    const list = parseJson(rows?.[0]?.reminder_defaults_json, null);
    return Array.isArray(list) && list.length ? list : null;
  } catch {
    return null;
  }
}

export async function resolveReminderDefaults({ agencyId, tenantServiceId = null } = {}) {
  if (tenantServiceId) {
    const svc = await TenantService.findById(tenantServiceId, agencyId);
    const fromSvc = parseJson(svc?.reminderDefaultsJson, null);
    if (Array.isArray(fromSvc) && fromSvc.length) return fromSvc;
  }
  const fromAgency = await getAgencyReminderDefaults(agencyId);
  if (fromAgency) return fromAgency;
  return DEFAULT_REMINDERS;
}

export async function logCommunication({
  appointmentId,
  agencyId,
  direction = 'outbound',
  channel = 'email',
  kind = 'reminder',
  bodyPreview = null,
  metadata = null,
  reminderId = null,
  createdByUserId = null
} = {}) {
  await pool.execute(
    `INSERT INTO appointment_communications
      (appointment_id, agency_id, direction, channel, kind, body_preview, metadata_json, reminder_id, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(appointmentId),
      Number(agencyId),
      direction,
      channel,
      kind,
      bodyPreview ? String(bodyPreview).slice(0, 500) : null,
      metadata ? JSON.stringify(metadata) : null,
      reminderId || null,
      createdByUserId || null
    ]
  );
}

export async function listCommunications(appointmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM appointment_communications
     WHERE appointment_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 200`,
    [Number(appointmentId)]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    appointmentId: Number(r.appointment_id),
    direction: r.direction,
    channel: r.channel,
    kind: r.kind,
    bodyPreview: r.body_preview,
    metadata: parseJson(r.metadata_json, null),
    reminderId: r.reminder_id == null ? null : Number(r.reminder_id),
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
    createdAt: r.created_at
  }));
}

export async function listReminders(appointmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM appointment_reminders WHERE appointment_id = ? ORDER BY scheduled_for ASC`,
    [Number(appointmentId)]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    appointmentId: Number(r.appointment_id),
    channel: r.channel,
    offsetMinutes: Number(r.offset_minutes),
    scheduledFor: r.scheduled_for,
    status: r.status,
    skipReason: r.skip_reason,
    sentAt: r.sent_at,
    errorMessage: r.error_message
  }));
}

/**
 * Create pending reminder rows from defaults. Idempotent if reminders already exist.
 */
export async function scheduleRemindersForAppointment(appointmentId, { replace = false } = {}) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) return [];
  const start = parseStartAt(appt.startAt);
  if (!start) return [];

  if (replace) {
    await pool.execute(
      `UPDATE appointment_reminders SET status = 'canceled'
       WHERE appointment_id = ? AND status = 'pending'`,
      [appt.id]
    );
  } else {
    const existing = await listReminders(appt.id);
    if (existing.some((r) => r.status === 'pending' || r.status === 'sent')) return existing;
  }

  const defaults = await resolveReminderDefaults({
    agencyId: appt.agencyId,
    tenantServiceId: appt.tenantServiceId
  });

  const created = [];
  for (const d of defaults) {
    const channel = String(d.channel || 'email').toLowerCase();
    if (!['email', 'sms', 'phone'].includes(channel)) continue;
    const offset = Math.max(0, Number(d.offsetMinutes ?? d.offset_minutes ?? 1440) || 0);
    const when = new Date(start.getTime() - offset * 60 * 1000);
    if (when.getTime() <= Date.now() - 60 * 1000) continue; // already past
    const scheduledFor = toMysqlDateTime(when);
    const [result] = await pool.execute(
      `INSERT INTO appointment_reminders
        (appointment_id, agency_id, channel, offset_minutes, scheduled_for, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [appt.id, appt.agencyId, channel, offset, scheduledFor]
    );
    created.push({
      id: Number(result.insertId),
      channel,
      offsetMinutes: offset,
      scheduledFor,
      status: 'pending'
    });
  }
  if (created.length) {
    await logCommunication({
      appointmentId: appt.id,
      agencyId: appt.agencyId,
      direction: 'system',
      channel: 'in_app',
      kind: 'reminder',
      bodyPreview: `Scheduled ${created.length} reminder(s)`,
      metadata: { count: created.length }
    });
  }
  return created;
}

export async function cancelPendingReminders(appointmentId) {
  await pool.execute(
    `UPDATE appointment_reminders SET status = 'canceled'
     WHERE appointment_id = ? AND status = 'pending'`,
    [Number(appointmentId)]
  );
}

async function clientHasSmsConsent(clientId) {
  if (!clientId) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT sms_opt_in, text_opt_in, communication_preferences_json
       FROM clients WHERE id = ? LIMIT 1`,
      [Number(clientId)]
    ).catch(() => [[]]);
    const row = rows?.[0];
    if (!row) return false;
    if (row.sms_opt_in === 1 || row.sms_opt_in === true || row.text_opt_in === 1) return true;
    const prefs = parseJson(row.communication_preferences_json, {});
    if (prefs?.sms === true || prefs?.smsOptIn === true || prefs?.textOptIn === true) return true;
    return false;
  } catch {
    return false;
  }
}

async function resolveRecipientForAppointment(appt) {
  const participants = await Appointment.listParticipants(appt.id);
  const reminderTargets = participants.filter((p) => p.receivesReminders !== false);
  const primary = reminderTargets[0] || participants[0] || null;
  let email = null;
  let phone = null;
  let clientId = primary?.clientId || null;
  let userId = primary?.userId || null;

  if (userId) {
    const user = await User.findById(userId).catch(() => null);
    email = user?.email || user?.work_email || null;
    phone = user?.personal_phone || user?.work_phone || user?.phone_number || null;
  }
  if (clientId && (!email || !phone)) {
    try {
      const [rows] = await pool.execute(
        `SELECT email, phone, guardian_email, guardian_phone FROM clients WHERE id = ? LIMIT 1`,
        [clientId]
      );
      const c = rows?.[0];
      if (c) {
        email = email || c.email || c.guardian_email || null;
        phone = phone || c.phone || c.guardian_phone || null;
      }
    } catch { /* ignore */ }
  }
  return { email, phone, clientId, userId, participantId: primary?.id || null };
}

async function sendOneReminder(row) {
  const appt = await Appointment.findById(row.appointment_id);
  if (!appt) {
    await pool.execute(
      `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'missing_appt' WHERE id = ?`,
      [row.id]
    );
    return { skipped: true };
  }
  if (String(appt.status || '').startsWith('canceled') || appt.status === 'late_canceled') {
    await pool.execute(
      `UPDATE appointment_reminders SET status = 'canceled', skip_reason = 'canceled_appt' WHERE id = ?`,
      [row.id]
    );
    return { skipped: true };
  }

  const recipient = await resolveRecipientForAppointment(appt);
  const channel = String(row.channel || 'email');
  const label = appt.title || 'Appointment';
  const when = appt.startAt;

  if (channel === 'email') {
    if (!recipient.email) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_recipient' WHERE id = ?`,
        [row.id]
      );
      return { skipped: true };
    }
    try {
      if (EmailService.isConfigured?.()) {
        await EmailService.sendEmail({
          to: recipient.email,
          subject: `Reminder: ${label}`,
          text: `Reminder: ${label} is scheduled for ${when}.\n\nReply CONFIRM or CANCEL if your provider supports SMS replies.`,
          html: `<p>Reminder: <strong>${label}</strong> is scheduled for ${when}.</p>`
        });
      }
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW() WHERE id = ?`,
        [row.id]
      );
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'email',
        kind: 'reminder',
        bodyPreview: `Email reminder to ${recipient.email}`,
        reminderId: row.id
      });
      return { sent: true };
    } catch (e) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'failed', error_message = ? WHERE id = ?`,
        [String(e?.message || 'send failed').slice(0, 500), row.id]
      );
      return { failed: true };
    }
  }

  if (channel === 'sms' || channel === 'phone') {
    const consent = await clientHasSmsConsent(recipient.clientId);
    if (!consent) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_consent' WHERE id = ?`,
        [row.id]
      );
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'sms',
        kind: 'reminder',
        bodyPreview: 'SMS skipped — no documented consent',
        reminderId: row.id,
        metadata: { skipReason: 'no_consent' }
      });
      return { skipped: true, reason: 'no_consent' };
    }
    const toPhoneNorm = recipient.phone ? PhoneNumber.normalizePhone(recipient.phone) : null;
    if (!toPhoneNorm) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_recipient' WHERE id = ?`,
        [row.id]
      );
      return { skipped: true };
    }
    try {
      const resolved = await resolveReminderNumber({
        providerUserId: appt.providerUserId,
        clientId: recipient.clientId
      });
      const from = resolved?.number?.phone_number
        ? PhoneNumber.normalizePhone(resolved.number.phone_number) || resolved.number.phone_number
        : null;
      if (!from) {
        await pool.execute(
          `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_from_number' WHERE id = ?`,
          [row.id]
        );
        return { skipped: true };
      }
      const body = `Reminder: ${label} on ${when}. Reply CONFIRM or CANCEL.`.slice(0, 480);
      await VonageService.sendSms({ to: toPhoneNorm, from, body });
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW() WHERE id = ?`,
        [row.id]
      );
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'sms',
        kind: 'reminder',
        bodyPreview: body,
        reminderId: row.id
      });
      try {
        const { recordSmsProfileAudit } = await import('./smsProfileAudit.service.js');
        await recordSmsProfileAudit({
          agencyId: appt.agencyId,
          direction: 'OUTBOUND',
          fromNumber: from,
          toNumber: toPhoneNorm,
          numberId: resolved?.number?.id || null,
          numberPurpose: resolved?.number?.number_purpose || 'notification',
          body,
          clientId: recipient.clientId || null,
          userId: recipient.userId || null
        });
      } catch (auditErr) {
        console.warn('[appointmentReminder] sms profile audit failed:', auditErr?.message || auditErr);
      }
      return { sent: true };
    } catch (e) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'failed', error_message = ? WHERE id = ?`,
        [String(e?.message || 'sms failed').slice(0, 500), row.id]
      );
      return { failed: true };
    }
  }

  await pool.execute(
    `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'channel_disabled' WHERE id = ?`,
    [row.id]
  );
  return { skipped: true };
}

/** Process due reminders (cron). */
export async function processDueReminders({ limit = 50 } = {}) {
  const [rows] = await pool.execute(
    `SELECT * FROM appointment_reminders
     WHERE status = 'pending' AND scheduled_for <= NOW()
     ORDER BY scheduled_for ASC
     LIMIT ?`,
    [Math.max(1, Math.min(200, Number(limit) || 50))]
  );
  const results = { sent: 0, skipped: 0, failed: 0 };
  for (const row of rows || []) {
    const out = await sendOneReminder(row);
    if (out?.sent) results.sent += 1;
    else if (out?.failed) results.failed += 1;
    else results.skipped += 1;
  }
  return { ...results, processed: (rows || []).length };
}

/** @deprecated use appointmentReply.service interpretAppointmentReply — kept for imports */
export function interpretReplyIntent(rawBody = '') {
  // Lazy require-style to avoid circular init issues in tests
  return interpretAppointmentReplyLazy(rawBody);
}

function interpretAppointmentReplyLazy(rawBody) {
  const raw = String(rawBody || '').trim();
  if (!raw) return 'unknown';
  if (/^(y|yes|c|confirm|confirmed|1)$/i.test(raw)) return 'confirm';
  if (/^(n|no|x|cancel|cancelled|canceled|2)$/i.test(raw)) return 'cancel';
  if (/^(r|reschedule|resched|move|3)$/i.test(raw)) return 'reschedule';
  const t = raw.toLowerCase();
  if (/^(confirm(ed)?|yes)\b/.test(t)) return 'confirm';
  if (/^(cancel(led|ed)?|no)\b/.test(t)) return 'cancel';
  if (/^(reschedule|re-?schedule|move|change)\b/.test(t)) return 'reschedule';
  return 'unknown';
}

/** Applies Y/N/R directly to the booking appointment. */
export async function ingestInboundReply(opts = {}) {
  const { applyAppointmentReply } = await import('./appointmentReply.service.js');
  return applyAppointmentReply(opts);
}
