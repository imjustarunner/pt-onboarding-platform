import pool from '../config/database.js';

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * True when a user belongs to:
 * - the agency itself, OR
 * - any active affiliated organization under that agency (school/program/learning/etc).
 *
 * This is intentionally used for Skill Builders + program-events surfaces where users may
 * be attached to a child org instead of the parent agency.
 */
export async function userHasAgencyOrAffiliatedOrgAccess({ userId, role, agencyId }) {
  const uid = parsePositiveInt(userId);
  const aid = parsePositiveInt(agencyId);
  const r = String(role || '').toLowerCase();
  if (!uid || !aid) return false;
  if (r === 'super_admin') return true;

  const [rows] = await pool.execute(
    `SELECT 1 AS ok
     FROM user_agencies ua
     JOIN agencies member_org ON member_org.id = ua.agency_id
     LEFT JOIN organization_affiliations oa
       ON oa.organization_id = member_org.id
      AND oa.is_active = TRUE
     WHERE ua.user_id = ?
       AND (
         member_org.id = ?
         OR oa.agency_id = ?
       )
     LIMIT 1`,
    [uid, aid, aid]
  );
  return !!rows?.[0]?.ok;
}

export async function userHasAgencyOrAffiliatedOrgAccessForRequest(req, agencyId) {
  return userHasAgencyOrAffiliatedOrgAccess({
    userId: req.user?.id,
    role: req.user?.role,
    agencyId
  });
}

