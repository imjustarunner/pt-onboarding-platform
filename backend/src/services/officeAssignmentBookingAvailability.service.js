import pool from '../config/database.js';
const fail = (message, status = 409) => Object.assign(new Error(message), { status });

export async function publishOfficeAssignmentEvent(assignment, event, db = pool, actorUserId = null) {
  if (!event?.id || assignment.bookable_in_person == null && assignment.bookable_virtual == null) return;
  if (event.client_id || event.clinical_session_id || event.billing_context_id || event.status === 'CANCELLED') return;
  if (Number(event.assigned_provider_id) !== Number(assignment.provider_id) || Number(event.standing_assignment_id) !== Number(assignment.id)) return;
  const [appointments] = await db.execute('SELECT id FROM appointments WHERE office_event_id = ? LIMIT 1', [event.id]);
  if (appointments.length) return;
  const agencyId = Number(assignment.booking_agency_id);
  if (!agencyId) throw fail('Choose the booking agency before opening this office time.');
  for (const [flag, table] of [['bookable_in_person', 'provider_in_person_slot_availability'], ['bookable_virtual', 'provider_virtual_slot_availability']]) {
    if (assignment[flag] == null) continue;
    if (!Number(assignment[flag])) {
      await db.execute(`UPDATE ${table} SET is_active = FALSE WHERE source_event_id = ? AND provider_id = ? AND agency_id = ?`, [event.id, assignment.provider_id, agencyId]);
      continue;
    }
    const inPerson = flag === 'bookable_in_person';
    await db.execute(`INSERT INTO ${table}
      (agency_id, provider_id, office_location_id, room_id, ${inPerson ? '' : 'session_type,'} start_at, end_at, is_active, available_for_intake, available_for_session, source, source_event_id, created_by_user_id)
      VALUES (?, ?, ?, ?, ${inPerson ? '' : "'BOTH',"} ?, ?, TRUE, TRUE, TRUE, 'OFFICE_EVENT', ?, ?)
      ON DUPLICATE KEY UPDATE ${inPerson ? '' : "session_type = 'BOTH',"} is_active = TRUE, available_for_intake = TRUE, available_for_session = TRUE, source_event_id = VALUES(source_event_id), updated_at = CURRENT_TIMESTAMP`,
      [agencyId, assignment.provider_id, assignment.office_location_id, assignment.room_id, event.start_at, event.end_at, event.id, actorUserId || assignment.provider_id]);
  }
}

export async function setOfficeAssignmentBookingAvailability({ assignmentId, providerId, agencyId, allowedOfficeIds, inPerson, virtual }) {
  if (typeof inPerson !== 'boolean' || typeof virtual !== 'boolean') throw fail('Choose in-person and virtual booking availability.', 400);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[assignment]] = await conn.execute('SELECT * FROM office_standing_assignments WHERE id = ? FOR UPDATE', [assignmentId]);
    if (!assignment || !assignment.is_active || Number(assignment.provider_id) !== Number(providerId)) throw fail('Office assignment not found for this provider.', 403);
    if (agencyId != null && Number(assignment.booking_agency_id) !== Number(agencyId)) throw fail('This reservation belongs to another agency.', 403);
    if (inPerson && Array.isArray(allowedOfficeIds) && !allowedOfficeIds.includes(Number(assignment.office_location_id))) throw fail('This office is not enabled in your agency profile availability settings.', 409);
    const [membership] = await conn.execute('SELECT ua.agency_id FROM user_agencies ua JOIN office_location_agencies ola ON ola.agency_id = ua.agency_id WHERE ua.user_id = ? AND ola.office_location_id = ? AND ua.agency_id = ? LIMIT 1', [providerId, assignment.office_location_id, assignment.booking_agency_id]);
    if (!membership.length) throw fail('This reservation needs a valid provider and office agency before it can be opened.');
    await conn.execute('UPDATE office_standing_assignments SET bookable_in_person = ?, bookable_virtual = ? WHERE id = ?', [Number(inPerson), Number(virtual), assignmentId]);
    const [events] = await conn.execute("SELECT * FROM office_events WHERE standing_assignment_id = ? AND end_at > UTC_TIMESTAMP() AND status <> 'CANCELLED' FOR UPDATE", [assignmentId]);
    for (const event of events) await publishOfficeAssignmentEvent({ ...assignment, bookable_in_person: Number(inPerson), bookable_virtual: Number(virtual) }, event, conn, providerId);
    await conn.commit();
    return { ok: true, inPerson, virtual };
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
