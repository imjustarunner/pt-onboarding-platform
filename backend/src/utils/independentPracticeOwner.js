import pool from '../config/database.js';

// Ownership belongs to this tenant, never to the employee's global role.
export async function isIndependentPracticeOwner(userId, agencyId) {
  const uid = Number(userId), aid = Number(agencyId);
  if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(aid) || aid <= 0) return false;
  const [rows] = await pool.execute(`SELECT a.id FROM agencies a
    JOIN user_agencies ua ON ua.agency_id = a.id AND ua.user_id = a.account_owner_user_id
    JOIN users u ON u.id = ua.user_id AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0
    WHERE a.id = ? AND a.account_owner_user_id = ? AND a.organization_type IN ('life_coach', 'consultant')
      AND a.is_active = 1 AND COALESCE(a.is_archived, 0) = 0 LIMIT 1`, [aid, uid]);
  return rows.length === 1;
}
