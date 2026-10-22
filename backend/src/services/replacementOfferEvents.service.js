import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export function replacementOutcome(status, nextAppointment = null, linkedAppointmentId = null) {
  if (status === 'confirmed') return `Session canceled — requested session confirmed and scheduled${linkedAppointmentId ? ` (appointment #${linkedAppointmentId})` : ''}.`;
  if (['declined', 'declined_by_team'].includes(status)) return `Session canceled — requested session denied${status === 'declined' ? ' by the client or guardian' : ' by the care team'}.`;
  if (status === 'expired') return nextAppointment
    ? `Session canceled — no response; next session scheduled for ${nextAppointment.displayWhen}.`
    : 'Session canceled — no response; no next session is currently scheduled. Staff follow-up is needed.';
  return 'Session canceled — reschedule requested; selected replacement time is being booked automatically.';
}

async function attachOutcome(event, offer, appointment, database = clinicalPool) {
  const conn = await database.getConnection();
  try {
    await conn.beginTransaction();
    const [sessions] = await conn.execute(`SELECT id,client_id FROM clinical_sessions WHERE agency_id=?
      AND (appointment_id=? OR id=? OR office_event_id=?) FOR UPDATE`,
    [offer.agency_id, offer.appointment_id, appointment.clinicalSessionId || null, appointment.officeEventId || null]);
    const clientSessions = sessions.filter(s => Number(s.client_id) === Number(offer.client_id));
    if (!clientSessions.length) throw new Error('Cancellation session note is not linked to this client yet.');
    for (const session of clientSessions) {
      const [[existing]] = await conn.execute(`SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=?
        AND note_type='APPOINTMENT_RESCHEDULE_OUTCOME' AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.replacementEventId'))=? LIMIT 1`, [session.id, offer.agency_id, String(event.id)]);
      if (existing) continue;
      const narrative = `${event.outcome_text} Recorded automatically from the replacement offer on ${parseUtcDate(event.created_at).toISOString()}. No service was rendered for the original appointment. This addendum is nonbillable and preserves the signed cancellation note.`;
      const payload = maybeEncryptNotePayload(narrative);
      await conn.execute(`INSERT INTO clinical_notes (clinical_session_id,agency_id,client_id,title,note_payload,metadata_json,
        created_by_user_id,note_type,content_hash,is_billable) VALUES (?,?,?,?,?,?,?,'APPOINTMENT_RESCHEDULE_OUTCOME',?,0)`,
      [session.id, offer.agency_id, offer.client_id, 'Cancellation reschedule outcome — nonbillable', payload,
        JSON.stringify({ source: 'replacement_offer', appointmentId: offer.appointment_id, replacementOfferId: offer.id,
          replacementEventId: event.id, eventType: event.event_type, nonBillable: true, systemGenerated: true, payloadEncrypted: payload !== narrative, requiresSupervisorCosign: false }),
        offer.created_by_user_id, createHash('sha256').update(narrative).digest('hex')]);
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

export async function sendReplacementProviderEmail(offer, event, database = pool) {
  const { ensureTenantNotificationsMailbox } = await import('./tenantMessageMailboxes.service.js');
  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  const [[provider]] = await database.execute('SELECT email FROM users WHERE id=? AND COALESCE(is_active,1)=1', [offer.provider_id]);
  if (!provider?.email) throw new Error('Provider has no current notification email.');
  const { notifications, domain } = await ensureTenantNotificationsMailbox(offer.agency_id);
  return sendEmailFromIdentity({ agencyId: offer.agency_id, senderIdentityId: notifications.id, to: provider.email,
    userId: offer.provider_id, replyToOverride: `noreply@${domain}`, templateType: 'replacement_time_selected',
    subject: 'A replacement appointment has been reserved', text: `${event.outcome_text}\n\n${offer.linked_appointment_id ? `A client or guardian reserved one of your offered times. Appointment #${offer.linked_appointment_id} is scheduled; no approval is needed. Open My Schedule to view it. If your availability changes, update the appointment and notify the family through the schedule-change flow.` : `Reservation #${offer.request_id} is being booked automatically. No provider approval is required.`} Please do not reply to this notification.` });
}

export function createReplacementOfferEventService(overrides = {}) {
  const d = { database: pool, now: () => new Date(), attach: attachOutcome, sendEmail: sendReplacementProviderEmail,
    appointment: async id => (await import('../models/Appointment.model.js')).default.findById(id),
    next: async (a, id) => (await import('./cancellationFollowUp.service.js')).cancellationFollowUp.nextAppointment(a, id), ...overrides };
  async function record(offer, status, connection = d.database) {
    let next = null;
    if (status === 'expired') next = await d.next(await d.appointment(offer.appointment_id), offer.client_id);
    await connection.execute(`INSERT IGNORE INTO appointment_replacement_events (offer_id,event_type,outcome_text,email_status)
      VALUES (?,?,?,?)`, [offer.id, status, replacementOutcome(status, next, offer.linked_appointment_id), status === 'confirmed' ? 'pending' : 'suppressed']);
  }
  async function processDue({ limit = 20 } = {}) {
    const size = Math.max(1, Math.min(100, Number(limit) || 20));
    const [offers] = await d.database.execute(`SELECT o.* FROM appointment_replacement_offers o
      WHERE (o.status IN ('requested','confirmed','declined','declined_by_team') OR (o.status='open' AND o.expires_at<=UTC_TIMESTAMP()))
      AND NOT EXISTS (SELECT 1 FROM appointment_replacement_events e WHERE e.offer_id=o.id
        AND e.event_type=IF(o.status='open','expired',o.status)) ORDER BY o.id LIMIT ${size}`);
    for (const offer of offers) await record(offer, offer.status === 'open' ? 'expired' : offer.status);
    const [events] = await d.database.execute(`SELECT * FROM appointment_replacement_events
      WHERE note_recorded_at IS NULL OR email_status='pending' ORDER BY id LIMIT ${size}`);
    let failed = 0;
    for (const event of events) {
      const [[offer]] = await d.database.execute('SELECT * FROM appointment_replacement_offers WHERE id=?', [event.offer_id]);
      if (!offer) continue;
      if (event.event_type === 'requested' && event.email_status === 'pending' && offer.linked_appointment_id) {
        await d.database.execute("UPDATE appointment_replacement_events SET email_status='suppressed' WHERE id=? AND email_status='pending'",[event.id]);
        event.email_status='suppressed';
      }
      if (!event.note_recorded_at) {
        try {
          await d.attach(event, offer, await d.appointment(offer.appointment_id));
          await d.database.execute('UPDATE appointment_replacement_events SET note_recorded_at=UTC_TIMESTAMP() WHERE id=?', [event.id]);
        } catch { failed++; }
      }
      if (event.email_status === 'pending') {
        const [claim] = await d.database.execute("UPDATE appointment_replacement_events SET email_status='sending' WHERE id=? AND email_status='pending'", [event.id]);
        if (claim.affectedRows !== 1) continue;
        let status = 'review', error = null;
        try {
          const result = await d.sendEmail(offer, event);
          status = (result?.id || result?.messageId) && !result?.skipped && !result?.blocked && !result?.pendingApproval && !result?.queued && !result?.redirected ? 'sent' : 'held';
          error = status === 'sent' ? null : result?.reason || 'Provider email was held; review before resending.';
        } catch (e) { error = String(e.message).slice(0, 500); }
        await d.database.execute("UPDATE appointment_replacement_events SET email_status=?,email_error=?,email_sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL) WHERE id=?", [status, error, status, event.id]);
      }
    }
    return { processed: events.length, failed };
  }
  return { record, processDue };
}
export const replacementOfferEvents = createReplacementOfferEventService();
