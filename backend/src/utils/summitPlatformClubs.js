/**
 * Summit Stats Team Challenge: restrict data to affiliation clubs linked to the platform
 * via organization_affiliations (same rule as public GET /summit-stats/clubs).
 *
 * Callers pass platform agency IDs from getPlatformAgencyIds() in summitStats.controller.js.
 */

/**
 * SQL fragment: club agency row `alias` is under one of the Summit platform tenant agencies.
 * @param {string} alias - Agencies table alias (e.g. 'a')
 * @param {number[]} platformAgencyIds
 * @returns {{ sql: string, params: number[] } | null}
 */
export function sqlAffiliationUnderSummitPlatform(alias, platformAgencyIds) {
  const ids = [...new Set((platformAgencyIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return null;
  const ph = ids.map(() => '?').join(', ');
  return {
    sql: ` AND EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id = ${alias}.id AND oa.agency_id IN (${ph}) AND oa.is_active = 1)`,
    params: ids
  };
}
