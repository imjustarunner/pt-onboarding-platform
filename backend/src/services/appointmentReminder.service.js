/**
 * Phase 4: per-appointment reminder schedule + communication timeline.
 * Email is standard; SMS/phone only when consent is documented (never silent opt-in).
 */

import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import TenantService from '../models/TenantService.model.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { APP_SESSION_REMINDERS } from './sessionReminderPolicy.js';

const DEFAULT_REMINDERS = APP_SESSION_REMINDERS.flatMap(rule=>rule.channels.map(channel=>({channel,offsetMinutes:rule.offsetMinutes})));

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
  createdByUserId = null,
  db = pool
} = {}) {
  const encryptedCancellation = kind === 'cancellation' || kind === 'notification_reply' || metadata?.scheduleNotice === true;
  const storedMetadata = encryptedCancellation
    ? maybeEncryptNotePayload(JSON.stringify({ ...(metadata || {}), bodyPreview }))
    : metadata ? JSON.stringify(metadata) : null;
  const [result] = await db.execute(
    `INSERT INTO appointment_communications
      (appointment_id, agency_id, direction, channel, kind, body_preview, metadata_json, reminder_id, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(appointmentId),
      Number(agencyId),
      direction,
      channel,
      kind,
      encryptedCancellation ? kind === 'notification_reply' ? 'Reply to session notification — view recorded message' : 'Cancellation notification — view recorded message' : bodyPreview ? String(bodyPreview).slice(0, 500) : null,
      storedMetadata,
      reminderId || null,
      createdByUserId || null
    ]
  );
  return { id: Number(result?.insertId || 0) };
}

export async function listCommunications(appointmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM appointment_communications
     WHERE appointment_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 200`,
    [Number(appointmentId)]
  );
  const [receipts] = rows?.length ? await pool.execute('SELECT communication_id,confirmed_at FROM cancellation_email_receipts WHERE appointment_id=?',[Number(appointmentId)]) : [[]];
  const [replyReviews] = rows?.some(row=>row.direction==='inbound') ? await pool.execute('SELECT id,raw_body,status,interpreted_intent FROM appointment_reply_reviews WHERE appointment_id=?',[Number(appointmentId)]) : [[]];
  const [emailReplies] = rows?.some(row=>row.kind==='notification_reply') ? await pool.execute('SELECT communication_id,action_status FROM session_notification_email_replies WHERE appointment_id=?',[Number(appointmentId)]) : [[]];
  return (rows || []).map((r) => {
    const raw = typeof r.metadata_json === 'string' ? r.metadata_json : JSON.stringify(r.metadata_json);
    const metadata = parseJson(maybeDecryptNotePayload(raw), null);
    const review = replyReviews.find(review=>Number(review.id)===Number(metadata?.reviewId));
    if(review && metadata) { metadata.body=review.raw_body;metadata.actionStatus=review.status;metadata.deliveryStatus='received'; }
    const emailReply=emailReplies.find(reply=>Number(reply.communication_id)===Number(r.id));
    if(emailReply && metadata) {metadata.actionStatus=emailReply.action_status;metadata.needsSupport=emailReply.action_status!=='applied';}
    const receipt = receipts.find(receipt=>Number(receipt.communication_id) === Number(metadata?.communicationId));
    if (receipt && metadata) { metadata.receiptRequired=true;metadata.receiptConfirmedAt=receipt.confirmed_at || null; }
    return ({
    id: Number(r.id),
    appointmentId: Number(r.appointment_id),
    direction: r.direction,
    channel: r.channel,
    kind: r.kind,
    bodyPreview: metadata?.bodyPreview || r.body_preview,
    metadata,
    reminderId: r.reminder_id == null ? null : Number(r.reminder_id),
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
    createdAt: r.created_at
  }); });
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
    kind: r.kind || 'reminder',
    ruleKey: r.rule_key || null,
    offsetMinutes: Number(r.offset_minutes),
    scheduledFor: r.scheduled_for,
    status: r.status,
    skipReason: r.skip_reason,
    sentAt: r.sent_at,
    errorMessage: r.error_message,
    messageBody: r.message_body || '', createdAt: r.created_at
  }));
}

/**
 * Create pending reminder rows from defaults. Idempotent if reminders already exist.
 */
export async function scheduleRemindersForAppointment(appointmentId, { replace = false } = {}) {
  return (await import('./sessionNotification.service.js')).scheduleSessionNotifications(appointmentId, { replace });
}

export async function cancelPendingReminders(appointmentId, { preserveManual = false } = {}) {
  await pool.execute(
    `UPDATE appointment_reminders SET status = 'canceled'
     WHERE appointment_id = ? AND status = 'pending'${preserveManual ? " AND COALESCE(rule_key,'')<>'manual_extra'" : ''}`,
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
