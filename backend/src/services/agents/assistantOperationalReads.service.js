// Only called after the tool registry has checked role and tenant access.
export async function readAcceptingProviders(db, agencyId) {
  const [rows] = await db.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name
       FROM users u JOIN user_agencies ua ON ua.user_id = u.id
      WHERE ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1
        AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
        AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'PROSPECTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING')
        AND u.provider_accepting_new_clients = 1
        AND (LOWER(u.role) IN ('provider', 'provider_plus', 'supervisor', 'intern', 'intern_plus', 'clinical_practice_assistant', 'counselor', 'therapist', 'coach') OR u.has_provider_access = 1)
      ORDER BY u.last_name, u.first_name LIMIT 51`, [agencyId]
  );
  return { providers: rows.slice(0, 50), hasMore: rows.length > 50 };
}

export async function readNextClientAppointment(db, agencyId, actorId) {
  const [rows] = await db.execute(
    `SELECT a.id, a.start_at, a.end_at, a.modality, a.source_timezone, a.status, a.title
       FROM appointments a
      WHERE (a.agency_id = ? OR a.parent_agency_id = ?) AND a.provider_user_id = ?
        AND a.start_at >= UTC_TIMESTAMP()
        AND a.status IN ('scheduled', 'confirmed', 'client_confirmed', 'reschedule_requested', 'cancellation_requested')
        AND EXISTS (SELECT 1 FROM appointment_participants ap WHERE ap.appointment_id = a.id AND ap.client_id IS NOT NULL)
      ORDER BY a.start_at, a.id LIMIT 1`, [agencyId, agencyId, actorId]
  );
  return { appointment: rows[0] || null };
}
