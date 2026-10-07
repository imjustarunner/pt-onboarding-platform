/**
 * Phase 4: per-appointment reminder schedule + communication timeline.
 * Email is standard; SMS/phone only when consent is documented (never silent opt-in).
 */

import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import TenantService from '../models/TenantService.model.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../utils/zonedWallTime.util.js';

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
  return dateToMysqlUtcDateTime(d);
}

function parseStartAt(startAt) {
  if (!startAt) return null;
  if (startAt instanceof Date) return startAt;
  const iso = utcMysqlToIso(startAt);
  if (iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
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

/** All reminder entry points share the same consent, location and sender checks. */
export async function processDueReminders(options = {}) {
  const { processDueSessionNotifications } = await import('./sessionNotification.service.js');
  return processDueSessionNotifications(options);
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
