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
  const learning=['learning','tutoring'].includes(String(row.businessType||row.business_type||client.client_type).toLowerCase());
  if(!learning)return guardianVirtualJoin(row);
  if(!['VIRTUAL','ONLINE','VIDEO','TELEHEALTH'].includes(String(row.modality).toUpperCase())||!['scheduled','confirmed','client_confirmed','in_progress'].includes(row.status))return null;
  // The provider's standing room is the destination for canonical appointments
  // too. Admission and student identity are checked again inside that office.
  const [offices]=await db.execute(`SELECT r.slug FROM provider_my_rooms r
    JOIN user_agencies ua ON ua.user_id=r.user_id AND ua.agency_id=r.agency_id AND ua.is_active=1
    WHERE r.user_id=? AND r.agency_id=? AND r.is_active=1 LIMIT 1`,[row.providerUserId,client.agency_id]);
  const entry=row.id?`/tutoring-session/appointment/${Number(row.id)}?clientId=${Number(client.client_id)}&agencyId=${Number(client.agency_id)}`:null;
  if(offices[0]?.slug)return entry||`/join/my-room/${encodeURIComponent(offices[0].slug)}`;
  try {
    const {officeForHost}=await import('./privateVirtualOffice.service.js');
    const {room}=await officeForHost(row.providerUserId,client.agency_id);
    return entry||`/join/my-room/${encodeURIComponent(room.slug)}`;
  } catch(error) {
    // A provider without an eligible video plan cannot expose a standing room.
    if(![403,404,409,503].includes(error.status))throw error;
  }
  const [rooms]=await db.execute(`SELECT DISTINCT s.id FROM learning_class_sessions s
    JOIN tutoring_session_clients m ON m.session_id=s.id AND m.client_id=?
    JOIN learning_program_classes c ON c.id=s.learning_class_id AND c.organization_id=?
    WHERE s.provider_user_id=? AND s.starts_at=? AND s.ends_at=?
      AND (s.session_subtype='tutoring' OR s.mode='individual')
      AND s.delivery_context IN ('virtual','online') AND s.status IN ('scheduled','live') LIMIT 2`,
  [client.client_id,client.agency_id,row.providerUserId,row.startAt,row.endAt]);
  return rooms.length===1?`/tutoring-session/${rooms[0].id}`:null;
}
