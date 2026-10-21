import pool from '../config/database.js';

// Explicit, expiring access to a fictional tutor's office. This never changes
// the shared meeting-membership policy or grants access to staff meetings.
export async function privateOfficeDemoAccess(room, db = pool) {
 if (!room?.id) return false;
 const [rows] = await db.execute(`SELECT 1 FROM private_office_demo_access g
  JOIN provider_my_rooms r ON r.id=g.room_id AND r.is_active=1
  JOIN users u ON u.id=r.user_id AND u.is_demo=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
  JOIN agencies a ON a.id=r.agency_id AND a.is_active=1
  JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=a.id AND ua.is_active=1
  WHERE g.room_id=? AND r.user_id=? AND r.agency_id=? AND g.expires_at>UTC_TIMESTAMP()
   AND u.status IN ('ACTIVE_EMPLOYEE','EHR_ONLY')
   AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.provider_id=u.id AND COALESCE(c.is_demo,0)=0)
   AND NOT EXISTS (SELECT 1 FROM client_service_enrollments se JOIN clients c ON c.id=se.client_id
     WHERE se.provider_user_id=u.id AND se.is_active=1 AND COALESCE(c.is_demo,0)=0)
   AND NOT EXISTS (SELECT 1 FROM appointments ap JOIN appointment_participants p ON p.appointment_id=ap.id
     JOIN clients c ON c.id=p.client_id WHERE ap.provider_user_id=u.id AND COALESCE(c.is_demo,0)=0)
  LIMIT 1`, [room.id,room.userId,room.agencyId]);
 return rows.length>0;
}
