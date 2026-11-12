import pool from '../config/database.js';

// Supervisor privileges also cover managers and mentors. Manual clinical
// note-signing time requires a clinical assignment in this specific agency.
export async function isClinicalSupervisorForAgency({ agencyId, userId, db = pool }) {
  const [rows] = await db.execute(`SELECT 1 AS eligible
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE u.id = ? AND ua.agency_id = ?
      AND u.status = 'ACTIVE_EMPLOYEE' AND COALESCE(u.is_active, 1) = 1
      AND COALESCE(u.is_archived, 0) = 0 AND COALESCE(ua.is_active, 1) = 1
      AND EXISTS (SELECT 1 FROM supervisor_assignments sa
        WHERE sa.supervisor_id = u.id AND sa.agency_id = ua.agency_id AND sa.supervisor_type = 'clinical')
    LIMIT 1`, [Number(userId), Number(agencyId)]);
  return rows?.[0]?.eligible === 1;
}
