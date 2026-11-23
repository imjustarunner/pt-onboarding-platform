export function officeOccupancy(event) {
  try {
    const context = typeof event?.session_context_json === 'string'
      ? JSON.parse(event.session_context_json) : event?.session_context_json;
    return context?.roomOccupancy || (context?.officeCancellationDisposition === 'release' ? 'vacant' : null);
  } catch {
    return null;
  }
}

export const roomAppointmentStatuses = "'scheduled','confirmed','client_confirmed','checked_in','in_progress','reschedule_requested','cancellation_requested'";

export function kioskAppointmentSql(event = 'e') {
  return `SELECT ap.id FROM appointments ap
    WHERE ap.office_event_id = ${event}.id
      AND ap.provider_user_id = COALESCE(${event}.booked_provider_id, ${event}.assigned_provider_id)
      AND ap.status IN (${roomAppointmentStatuses})
      AND EXISTS (SELECT 1 FROM appointment_participants participant
        WHERE participant.appointment_id = ap.id AND participant.client_id IS NOT NULL)
    ORDER BY ap.start_at, ap.id LIMIT 1`;
}
