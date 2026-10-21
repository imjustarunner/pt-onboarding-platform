// Only expose a real room attached to this appointment. Never construct a
// learning-room route from a canonical appointment ID.
export function guardianVirtualJoin(row) {
  if (!['VIRTUAL', 'TELEHEALTH', 'VIDEO', 'ONLINE'].includes(String(row.modality || '').toUpperCase())) return null;
  if (!['scheduled', 'confirmed', 'client_confirmed', 'in_progress'].includes(row.status)) return null;
  try {
    const url = new URL(row.googleMeetLink);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function guardianAppointmentJoin(row,client,db) {
  if(!['learning','tutoring'].includes(String(client.client_type).toLowerCase()))return guardianVirtualJoin(row);
  if(!['VIRTUAL','ONLINE','VIDEO'].includes(String(row.modality).toUpperCase())||!['scheduled','confirmed','client_confirmed','in_progress'].includes(row.status))return null;
  const [rooms]=await db.execute(`SELECT DISTINCT s.id FROM learning_class_sessions s
    JOIN learning_class_client_memberships m ON m.learning_class_id=s.learning_class_id AND m.client_id=? AND m.membership_status='active'
    JOIN clients c ON c.id=m.client_id AND c.agency_id=?
    WHERE s.provider_user_id=? AND s.starts_at=? AND s.ends_at=?
      AND (s.session_subtype='tutoring' OR s.mode='individual')
      AND s.delivery_context IN ('virtual','online') AND s.status IN ('scheduled','live') LIMIT 2`,
  [client.client_id,client.agency_id,row.providerUserId,row.startAt,row.endAt]);
  return rooms.length===1?`/tutoring-session/${rooms[0].id}`:null;
}
