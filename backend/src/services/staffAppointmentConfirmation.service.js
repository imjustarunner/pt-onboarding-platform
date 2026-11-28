import pool from '../config/database.js';
import { logCommunication } from './appointmentReminder.service.js';
import { sessionRsvpState } from './sessionReminderPolicy.js';

const reject = (message) => Object.assign(new Error(message), { status: 409 });

export async function recordStaffAppointmentConfirmation(appointment, actorUserId, db = pool) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[current]] = await connection.execute(
      `SELECT status, product_origin, cancellation_recommendation_json,
              start_at > UTC_TIMESTAMP() AS upcoming,
              (SELECT COUNT(*) FROM appointment_participants p
                 WHERE p.appointment_id = a.id AND p.client_id IS NOT NULL) AS client_count
       FROM appointments a WHERE a.id = ? AND a.agency_id = ? AND a.provider_user_id = ?
       FOR UPDATE`,
      [appointment.id, appointment.agencyId, appointment.providerUserId]
    );
    if (!current || !current.upcoming || current.product_origin === 'auricwell_ehr' || Number(current.client_count) !== 1) {
      throw reject('Only an upcoming individual appointment can be confirmed here.');
    }
    if (!['scheduled', 'confirmed', 'client_confirmed'].includes(current.status)) {
      throw reject('This appointment has a pending change or is no longer scheduled.');
    }
    const rsvp = sessionRsvpState(current);
    if (rsvp !== 'confirmed') {
      if (current.status !== 'scheduled' || rsvp !== 'unanswered') {
        throw reject('This appointment has a pending change or is no longer scheduled.');
      }
      await connection.execute(
        `UPDATE appointments SET status = 'client_confirmed', updated_by_user_id = ?,
           cancellation_recommendation_json = JSON_SET(
             COALESCE(cancellation_recommendation_json, JSON_OBJECT()),
             '$.staffConfirmationRecordedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ')
           )
         WHERE id = ?`,
        [actorUserId, appointment.id]
      );
      await logCommunication({
        appointmentId: appointment.id,
        agencyId: appointment.agencyId,
        direction: 'system',
        channel: 'other',
        kind: 'staff_confirmation',
        bodyPreview: 'Staff recorded the client’s appointment confirmation.',
        createdByUserId: actorUserId,
        db: connection
      });
    }
    await connection.commit();
    return { ok: true, status: rsvp === 'confirmed' ? current.status : 'client_confirmed' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
