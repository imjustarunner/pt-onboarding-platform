/**
 * Whether a client row is affiliated with a school (vs in-office / agency-only).
 * Mirrors frontend affiliationDisplayLabel "Office" detection.
 */
import pool from '../config/database.js';

export const SCHOOL_LIKE_ORG_TYPES = new Set(['school', 'program', 'learning']);

export function isSchoolLikeOrgType(orgType) {
  return SCHOOL_LIKE_ORG_TYPES.has(String(orgType || '').trim().toLowerCase());
}

/** True when the client's primary affiliation is in-office, not a school. */
export function isOfficeAffiliationRow(row) {
  const name = String(row?.organization_name || '').trim();
  const type = String(row?.organization_type || row?.agency_organization_type || '').toLowerCase();
  const orgId = Number(row?.organization_id || 0);
  const agencyId = Number(row?.agency_id || 0);
  const clientType = String(row?.client_type || '').toLowerCase();

  if (type === 'office') return true;
  if (orgId > 0 && agencyId > 0 && orgId === agencyId && ['agency', 'clinical', ''].includes(type)) {
    return true;
  }
  if (clientType === 'clinical') return true;
  if (/^itsco$/i.test(name) && type !== 'school') return true;
  if (/\boffice\b/i.test(name) && !/\bschool\b/i.test(name)) return true;
  return false;
}

/** Fast path from list-row fields (no extra queries). */
export function isSchoolAffiliatedClientRow(row) {
  if (!row || isOfficeAffiliationRow(row)) return false;

  const clientType = String(row?.client_type || '').toLowerCase();
  if (clientType === 'school') return true;
  if (clientType === 'learning') return true;

  if (isSchoolLikeOrgType(row?.organization_type)) return true;

  return false;
}

/**
 * Batch-resolve school-affiliated client IDs (includes school-like COA rows).
 */
export async function resolveSchoolAffiliatedClientIds(clientRows = []) {
  const rows = Array.isArray(clientRows) ? clientRows : [];
  const affiliated = new Set();
  const needsCoaCheck = [];

  for (const row of rows) {
    const id = Number(row?.id || row?.client_id || 0);
    if (!id) continue;
    if (isOfficeAffiliationRow(row)) continue;
    if (isSchoolAffiliatedClientRow(row)) {
      affiliated.add(id);
    } else {
      needsCoaCheck.push(id);
    }
  }

  if (!needsCoaCheck.length) return affiliated;

  const placeholders = needsCoaCheck.map(() => '?').join(',');
  try {
    const [coaRows] = await pool.execute(
      `SELECT DISTINCT coa.client_id
       FROM client_organization_assignments coa
       INNER JOIN agencies o ON o.id = coa.organization_id
       WHERE coa.client_id IN (${placeholders})
         AND LOWER(COALESCE(o.organization_type, '')) IN ('school', 'program', 'learning')`,
      needsCoaCheck
    );
    for (const r of coaRows || []) {
      const cid = Number(r.client_id);
      if (cid) affiliated.add(cid);
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  return affiliated;
}
