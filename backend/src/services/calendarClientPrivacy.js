const clientEventKinds = new Set(['SESSION', 'CLINICAL_SESSION', 'INDIVIDUAL_SESSION', 'GROUP_SESSION', 'VIRTUAL_SESSION']);

export function isClientCalendarEvent(row = {}) {
  return Number(row.client_id ?? row.clientId) > 0
    || Number(row.appointment_id ?? row.appointmentId) > 0
    || Number(row.clinical_session_id ?? row.clinicalSessionId) > 0
    || clientEventKinds.has(String(row.kind || '').toUpperCase());
}

// Appointment details and joining information belong to the signed-in app.
export function privateClientCalendarFields() {
  return {
    summary: 'Client session',
    description: '',
    location: '',
    visibility: 'private',
    attendees: [],
    attachments: [],
    conferenceData: null,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false
  };
}

export async function isLinkedClientCalendarCopy(db, providerId, googleEventId) {
  const [rows] = await db.execute(`
    SELECT p.id FROM provider_schedule_events p
    WHERE p.provider_id=? AND p.google_event_id=?
      AND (p.client_id IS NOT NULL OR p.kind IN ('SESSION','CLINICAL_SESSION','INDIVIDUAL_SESSION','GROUP_SESSION','VIRTUAL_SESSION')
        OR EXISTS (SELECT 1 FROM appointments a WHERE a.provider_schedule_event_id=p.id AND a.agency_id=p.agency_id))
    LIMIT 1`, [providerId,googleEventId]);
  return rows.length > 0;
}
