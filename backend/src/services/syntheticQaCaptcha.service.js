import pool from '../config/database.js';
import { canSkipSyntheticQaRecoveryCaptcha, isSyntheticQaCaptchaAgency } from '../utils/syntheticQaCaptchaPolicy.js';

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

// Agency models can return a raw child row without the derived affiliation.
// Resolve the unique active relationship and its actual parent here rather
// than assuming another model lookup hydrated it. Missing, ambiguous, inactive
// or non-synthetic parents keep CAPTCHA enabled.
export async function hydrateSyntheticQaCaptchaAgency(agency, db = pool) {
  if (![451, 452, 454].includes(Number(agency?.id))) return agency;
  const restricted = { ...agency, affiliated_agency_id: null };
  try {
    const [rows] = await db.execute(`SELECT a.id,a.slug,a.portal_url,a.organization_type,
        a.feature_flags,a.is_active,a.is_archived,
        p.id AS captcha_parent_id,p.slug AS captcha_parent_slug,
        p.feature_flags AS captcha_parent_flags,p.is_active AS captcha_parent_active,
        p.is_archived AS captcha_parent_archived,p.organization_type AS captcha_parent_type
      FROM agencies a LEFT JOIN agencies p ON p.id=(
        SELECT CASE WHEN COUNT(DISTINCT oa.agency_id)=1 THEN MIN(oa.agency_id) END
        FROM organization_affiliations oa WHERE oa.organization_id=a.id AND oa.is_active=1
      ) WHERE a.id=? LIMIT 1`, [Number(agency.id)]);
    const row = rows?.[0];
    if (!row) return restricted;
    const parent = { id: row.captcha_parent_id, slug: row.captcha_parent_slug,
      feature_flags: row.captcha_parent_flags, is_active: row.captcha_parent_active,
      is_archived: row.captcha_parent_archived, organization_type: row.captcha_parent_type };
    const { captcha_parent_id, captcha_parent_slug, captcha_parent_flags,
      captcha_parent_active, captcha_parent_archived, captcha_parent_type, ...stored } = row;
    return { ...agency, ...stored, affiliated_agency_id: isSyntheticQaCaptchaAgency(parent) ? parent.id : null };
  } catch { return restricted; }
}
