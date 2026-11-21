// Derive the hold from current appointments so edits and cancellations take
// effect without mutating the assignment or creating a second reservation.
export function officeSessionGapSql(slot = 'e') {
  const sameSessionRoom = alias => `
    ${alias}.provider_user_id = ${slot}.assigned_provider_id
    AND ${alias}.room_id = ${slot}.room_id
    AND ${alias}.status IN ('scheduled', 'confirmed', 'client_confirmed', 'checked_in', 'in_progress', 'completed')`;
  return `CASE WHEN ${slot}.slot_state = 'ASSIGNED_AVAILABLE'
    AND COALESCE(${slot}.status, '') NOT IN ('BOOKED', 'CANCELLED')
    AND ${slot}.client_id IS NULL
    AND ${slot}.clinical_session_id IS NULL
    AND TIMESTAMPDIFF(SECOND, ${slot}.start_at, ${slot}.end_at) BETWEEN 1 AND 7200
    THEN EXISTS (
      SELECT 1 FROM appointments earlier
      JOIN appointments later ON ${sameSessionRoom('later')}
        AND later.start_at >= ${slot}.end_at
        AND later.start_at <= DATE_ADD(earlier.end_at, INTERVAL 2 HOUR)
      WHERE ${sameSessionRoom('earlier')}
        AND earlier.start_at < ${slot}.start_at
        AND earlier.end_at <= ${slot}.start_at
        AND earlier.end_at >= DATE_SUB(${slot}.end_at, INTERVAL 2 HOUR)
    ) AND NOT EXISTS (
      SELECT 1 FROM appointments occupied
      WHERE ${sameSessionRoom('occupied')}
        AND occupied.start_at < ${slot}.end_at AND occupied.end_at > ${slot}.start_at
    )
    ELSE 0 END`;
}
