import pool from '../config/database.js';
import { canSkipSyntheticQaRecoveryCaptcha } from '../utils/syntheticQaCaptchaPolicy.js';

// Deliberately reads minimal stored identity/memberships, not authentication
// secrets. Missing/ambiguous identity or any lookup failure fails closed.
export async function skipSyntheticQaRecoveryCaptcha({ identifier, organizationSlug } = {}, db = pool) {
  const name = String(identifier || '').trim().toLowerCase();
  const slug = String(organizationSlug || '').trim().toLowerCase();
  if (!name || name.length > 254 || !slug || slug.length > 120) return false;
  try {
    const [users] = await db.execute(`SELECT id,is_demo,is_active,is_archived FROM users
      WHERE LOWER(TRIM(username))=? OR LOWER(TRIM(email))=? LIMIT 2`, [name, name]);
    if (users.length !== 1) return false;
    const [memberships] = await db.execute(`SELECT a.id,a.slug,a.portal_url,a.organization_type,
      (SELECT CASE WHEN COUNT(DISTINCT oa.agency_id)=1 THEN MIN(oa.agency_id) END
        FROM organization_affiliations oa WHERE oa.organization_id=a.id AND oa.is_active=1) AS affiliated_agency_id,
      a.feature_flags,a.is_active,a.is_archived
      FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
      WHERE ua.user_id=? AND ua.is_active=1`, [users[0].id]);
    return canSkipSyntheticQaRecoveryCaptcha(users[0], memberships, slug);
  } catch { return false; }
}
