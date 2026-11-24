import pool from '../config/database.js';

// A client's cadence belongs to the session, never to the standing room reservation.
export function appointmentRecurrence(row = {}) {
  let context = row.session_context_json || {};
  if (typeof context === 'string') { try { context = JSON.parse(context); } catch { context = {}; } }
  if (context?.appointmentMoveDetached) return { recurrenceSeriesId: null, recurrenceFrequency: 'ONCE' };
  const series = row.recurrence_series_id || (context?.reservedSessionBookingKey ? `office-session:${String(context.reservedSessionBookingKey).slice(0, 32)}` : null);
  const frequency = String(row.recurrence_frequency || context?.reservedSessionBookingFrequency || '').toUpperCase();
  if (frequency === 'ONCE') return { recurrenceSeriesId: null, recurrenceFrequency: 'ONCE' };
  const known = ['WEEKLY', 'BIWEEKLY', 'EVERY_3_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY'].includes(frequency);
  return { recurrenceSeriesId: series, recurrenceFrequency: known ? frequency : series ? null : 'ONCE' };
}

export async function getAppointmentRecurrence(appointment) {
  if (!appointment.providerScheduleEventId && !appointment.officeEventId) return appointmentRecurrence();
  const [[row]] = await pool.execute(`SELECT p.recurrence_series_id, p.recurrence_frequency, e.session_context_json
    FROM appointments a
    LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id AND p.agency_id=a.agency_id
    LEFT JOIN office_events e ON e.id=a.office_event_id
    WHERE a.id=? AND a.agency_id=?`, [appointment.id, appointment.agencyId]);
  return appointmentRecurrence(row);
}
