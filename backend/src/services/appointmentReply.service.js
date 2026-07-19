/**
 * Interactive appointment reminder replies: Y confirm / N cancel / R reschedule.
 * Applies directly to the unified booking appointment (not review-only).
 */

import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { logCommunication } from './appointmentReminder.service.js';

export const REPLY_PROMPT =
  'Reply Y to confirm, N to cancel, R to request a reschedule.';

/**
 * @returns {'confirm'|'cancel'|'reschedule'|'unknown'}
 */
export function interpretAppointmentReply(rawBody = '') {
  const raw = String(rawBody || '').trim();
  if (!raw) return 'unknown';
  const t = raw.toLowerCase();

  // Exact single-token shortcuts (preferred for SMS)
  if (/^(y|yes|c|confirm|confirmed|1)$/i.test(raw)) return 'confirm';
  if (/^(n|no|x|cancel|cancelled|canceled|2)$/i.test(raw)) return 'cancel';
  if (/^(r|reschedule|resched|move|3)$/i.test(raw)) return 'reschedule';

  // Short phrases
  if (/^(confirm(ed)?|yes)\b/.test(t)) return 'confirm';
  if (/^(cancel(led|ed)?|no)\b/.test(t)) return 'cancel';
  if (/^(reschedule|re-?schedule|move|change)\b/.test(t)) return 'reschedule';

  return 'unknown';
}

export function buildReminderMessage({ title, when, askConfirmation = true } = {}) {
  const label = title || 'Appointment';
  let body = `Reminder: ${label} on ${when}.`;
  if (askConfirmation) {
    body += ` ${REPLY_PROMPT}`;
  }
  return body.slice(0, 480);
}

export function buildConfirmationMessage({ title, when } = {}) {
  const label = title || 'Appointment';
  return `Please confirm your appointment "${label}" on ${when}. ${REPLY_PROMPT}`.slice(0, 480);
}

/**
 * Find the best upcoming appointment for a client to attach an inbound reply.
 * Prefers appointments that recently sent a confirmation-style reminder.
 */
export async function resolveAppointmentForClientReply({ agencyId, clientId } = {}) {
  const aid = Number(agencyId || 0);
  const cid = Number(clientId || 0);
  if (!aid || !cid) return null;

  const [withReminder] = await pool.execute(
    `SELECT a.*
     FROM appointments a
     JOIN appointment_participants p
       ON p.appointment_id = a.id AND p.client_id = ?
     WHERE a.agency_id = ?
       AND a.start_at > NOW()
       AND a.status NOT LIKE 'canceled%'
       AND a.status NOT IN ('completed', 'no_show', 'late_canceled', 'rescheduled')
       AND EXISTS (
         SELECT 1 FROM appointment_reminders r
         WHERE r.appointment_id = a.id
           AND r.status = 'sent'
           AND (
             r.requires_confirmation = 1
             OR r.kind LIKE 'confirmation%'
             OR r.kind LIKE '%reminder%'
           )
           AND r.sent_at >= (NOW() - INTERVAL 14 DAY)
       )
     ORDER BY a.start_at ASC
     LIMIT 1`,
    [cid, aid]
  ).catch(() => [[]]);

  if (withReminder?.[0]) return Appointment.mapRow(withReminder[0]);

  const [rows] = await pool.execute(
    `SELECT a.*
     FROM appointments a
     JOIN appointment_participants p
       ON p.appointment_id = a.id AND p.client_id = ?
     WHERE a.agency_id = ?
       AND a.start_at > NOW()
       AND a.status NOT LIKE 'canceled%'
       AND a.status NOT IN ('completed', 'no_show', 'late_canceled', 'rescheduled')
     ORDER BY a.start_at ASC
     LIMIT 1`,
    [cid, aid]
  );
  return Appointment.mapRow(rows?.[0]);
}

async function notifyProviderInApp(appt, title, message) {
  if (!appt?.providerUserId) return;
  try {
    const NotificationDispatcher = (await import('./notificationDispatcher.service.js')).default;
    await NotificationDispatcher.createNotificationAndDispatch({
      userId: appt.providerUserId,
      agencyId: appt.agencyId,
      type: 'public_appointment_request_received',
      title,
      message,
      relatedEntityType: 'appointment',
      relatedEntityId: appt.id
    });
  } catch {
    /* optional */
  }
}

/**
 * Apply Y/N/R to the appointment and record review + timeline.
 */
export async function applyAppointmentReply({
  appointmentId,
  agencyId = null,
  channel = 'sms',
  rawBody,
  clientId = null,
  autoApply = true
} = {}) {
  const intent = interpretAppointmentReply(rawBody);
  const appt = await Appointment.findById(appointmentId);
  if (!appt) {
    throw Object.assign(new Error('Appointment not found'), { status: 404 });
  }
  const aid = Number(agencyId || appt.agencyId);

  const [ins] = await pool.execute(
    `INSERT INTO appointment_reply_reviews
      (appointment_id, agency_id, channel, raw_body, interpreted_intent, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      appt.id,
      aid,
      channel,
      String(rawBody || '').slice(0, 4000),
      intent,
      intent === 'unknown' || !autoApply ? 'pending_review' : 'pending_review'
    ]
  );
  const reviewId = Number(ins.insertId);

  await logCommunication({
    appointmentId: appt.id,
    agencyId: aid,
    direction: 'inbound',
    channel,
    kind: intent === 'cancel' ? 'cancel_reply' : (intent === 'confirm' ? 'confirm_reply' : (intent === 'reschedule' ? 'other' : 'other')),
    bodyPreview: String(rawBody || '').slice(0, 500),
    metadata: { intent, reviewId, shortcut: 'Y/N/R' }
  });

  if (!autoApply || intent === 'unknown') {
    return {
      reviewId,
      intent,
      status: 'pending_review',
      appointmentId: appt.id,
      clientReply: null,
      ackMessage: `Thanks — we received your message. A staff member will follow up. ${REPLY_PROMPT}`
    };
  }

  let clientReply = null;
  let ackMessage = '';

  if (intent === 'confirm') {
    await Appointment.update(appt.id, {
      status: 'client_confirmed',
      notes: appt.notes,
      updatedByUserId: null
    });
    // Store confirmation stamp on recommendation-style JSON if columns exist
    try {
      await pool.execute(
        `UPDATE appointments
         SET status = 'client_confirmed',
             cancellation_recommendation_json = JSON_SET(
               COALESCE(cancellation_recommendation_json, JSON_OBJECT()),
               '$.clientReply', 'confirm',
               '$.clientRepliedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
               '$.clientReplyChannel', ?
             )
         WHERE id = ?`,
        [channel, appt.id]
      );
    } catch {
      /* status already updated */
    }
    await pool.execute(
      `UPDATE appointment_reply_reviews SET status = 'applied', reviewed_at = NOW() WHERE id = ?`,
      [reviewId]
    );
    clientReply = 'confirm';
    ackMessage = 'Thanks — your appointment is confirmed. See you then!';
    await notifyProviderInApp(
      appt,
      'Client confirmed appointment',
      `Client confirmed appointment #${appt.id} (${appt.title || 'session'} on ${appt.startAt}).`
    );
  } else if (intent === 'cancel') {
    try {
      const { cancelAppointment } = await import('./appointment.service.js');
      await cancelAppointment(appt.id, {
        status: 'canceled_by_client',
        actorRole: 'client',
        actorUserId: null,
        clientId: clientId || null,
        reason: `Client replied ${String(rawBody || '').trim().slice(0, 40)} via ${channel}`,
        notes: `Canceled via appointment reminder reply (${channel})`
      });
      await pool.execute(
        `UPDATE appointment_reply_reviews SET status = 'applied', reviewed_at = NOW() WHERE id = ?`,
        [reviewId]
      );
      clientReply = 'cancel';
      ackMessage = 'Your appointment has been canceled. Contact us if you need to rebook.';
      await notifyProviderInApp(
        appt,
        'Client canceled appointment',
        `Client canceled appointment #${appt.id} (${appt.title || 'session'} on ${appt.startAt}) via ${channel}.`
      );
    } catch (e) {
      await pool.execute(
        `UPDATE appointment_reply_reviews SET status = 'pending_review' WHERE id = ?`,
        [reviewId]
      );
      clientReply = 'cancel_blocked';
      ackMessage = e?.message
        ? `We could not cancel automatically (${e.message}). Staff will follow up.`
        : 'We could not cancel automatically. Staff will follow up.';
    }
  } else if (intent === 'reschedule') {
    await Appointment.update(appt.id, {
      status: 'reschedule_requested',
      updatedByUserId: null
    });
    try {
      await pool.execute(
        `UPDATE appointments
         SET status = 'reschedule_requested',
             cancellation_recommendation_json = JSON_SET(
               COALESCE(cancellation_recommendation_json, JSON_OBJECT()),
               '$.clientReply', 'reschedule',
               '$.clientRepliedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
               '$.clientReplyChannel', ?
             )
         WHERE id = ?`,
        [channel, appt.id]
      );
    } catch { /* ignore */ }
    await pool.execute(
      `UPDATE appointment_reply_reviews SET status = 'applied', reviewed_at = NOW() WHERE id = ?`,
      [reviewId]
    );
    clientReply = 'reschedule';
    ackMessage = 'Got it — we marked a reschedule request. Someone will contact you to pick a new time.';
    await notifyProviderInApp(
      appt,
      'Client requested reschedule',
      `Client requested to reschedule appointment #${appt.id} (${appt.title || 'session'} on ${appt.startAt}).`
    );
  }

  return {
    reviewId,
    intent,
    status: clientReply && clientReply !== 'cancel_blocked' ? 'applied' : 'pending_review',
    appointmentId: appt.id,
    clientReply,
    ackMessage
  };
}

/**
 * Client sent free-text (not Y/N/R) while they have an upcoming appointment /
 * recent reminder — queue for support engagement via the texting platform.
 */
export async function escalateUnknownAppointmentReply({
  appointmentId,
  agencyId,
  clientId = null,
  channel = 'sms',
  rawBody
} = {}) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) return null;

  const [ins] = await pool.execute(
    `INSERT INTO appointment_reply_reviews
      (appointment_id, agency_id, channel, raw_body, interpreted_intent, status)
     VALUES (?, ?, ?, ?, 'unknown', 'pending_review')`,
    [
      appt.id,
      Number(agencyId || appt.agencyId),
      channel,
      String(rawBody || '').slice(0, 4000)
    ]
  );
  const reviewId = Number(ins.insertId);

  await logCommunication({
    appointmentId: appt.id,
    agencyId: Number(agencyId || appt.agencyId),
    direction: 'inbound',
    channel,
    kind: 'other',
    bodyPreview: String(rawBody || '').slice(0, 500),
    metadata: {
      intent: 'unknown',
      reviewId,
      needsSupport: true,
      reason: 'non_ynr_reply'
    }
  });

  try {
    await pool.execute(
      `UPDATE appointments
       SET cancellation_recommendation_json = JSON_SET(
         COALESCE(cancellation_recommendation_json, JSON_OBJECT()),
         '$.clientReply', 'unknown',
         '$.clientRepliedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
         '$.clientReplyChannel', ?,
         '$.needsSupport', true,
         '$.supportReviewId', ?
       )
       WHERE id = ?`,
      [channel, reviewId, appt.id]
    );
  } catch { /* optional */ }

  await notifyProviderInApp(
    appt,
    'Client text needs support (appointment)',
    `Client sent a message that is not Y/N/R about appointment #${appt.id} (${appt.title || 'session'} on ${appt.startAt}). Open the texting inbox to reply.`
  );

  return {
    reviewId,
    intent: 'unknown',
    status: 'pending_review',
    appointmentId: appt.id,
    clientId: clientId || null,
    needsSupport: true,
    fallThroughToInbox: true,
    // Soft ACK — conversation continues in the texting platform
    ackMessage:
      'Thanks — we got your message. A team member will text you back shortly. '
      + `For quick replies you can still send Y (confirm), N (cancel), or R (reschedule).`
  };
}

/**
 * Vonage / SMS entry:
 * - Y/N/R → apply to booking and ACK (caller should return)
 * - unknown but appointment context → escalate to support + fall through to inbox
 * - no appointment context → null (normal SMS routing)
 */
export async function handleInboundSmsAppointmentReply({
  agencyId,
  clientId,
  rawBody,
  channel = 'sms'
} = {}) {
  const intent = interpretAppointmentReply(rawBody);
  const appt = await resolveAppointmentForClientReply({ agencyId, clientId });
  if (!appt) return null;

  if (intent === 'unknown') {
    const escalated = await escalateUnknownAppointmentReply({
      appointmentId: appt.id,
      agencyId: appt.agencyId,
      clientId,
      channel,
      rawBody
    });
    return {
      ...escalated,
      appointment: { id: appt.id, startAt: appt.startAt, title: appt.title }
    };
  }

  const result = await applyAppointmentReply({
    appointmentId: appt.id,
    agencyId: appt.agencyId,
    channel,
    rawBody,
    clientId,
    autoApply: true
  });

  return {
    ...result,
    needsSupport: false,
    fallThroughToInbox: false,
    appointment: { id: appt.id, startAt: appt.startAt, title: appt.title }
  };
}
