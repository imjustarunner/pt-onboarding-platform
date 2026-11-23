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

export const buildingAppointmentKioskFilter = `ap.office_event_id IS NULL AND ap.room_id IS NULL
  AND ap.modality='IN_PERSON' AND ap.status IN (${roomAppointmentStatuses})
  AND EXISTS (SELECT 1 FROM appointment_participants p WHERE p.appointment_id=ap.id AND p.client_id IS NOT NULL)
  AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=ap.provider_user_id AND ua.agency_id=ap.agency_id AND ua.is_active=1)
  AND EXISTS (SELECT 1 FROM office_locations l WHERE l.id=ap.office_location_id AND l.is_active=1
    AND (l.agency_id=ap.agency_id OR EXISTS (SELECT 1 FROM office_location_agencies ola WHERE ola.office_location_id=l.id AND ola.agency_id=ap.agency_id)))`;
