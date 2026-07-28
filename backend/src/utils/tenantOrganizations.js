/**
 * Tenant (root) organization types. Supervision and similar cross-org
 * relationships are scoped to these, not schools/programs/clubs.
 */
export function isTenantOrganizationType(orgType) {
  const t = String(orgType || 'agency').toLowerCase();
  return t === 'agency' || t === 'clubwebapp' || t === 'life_coach' || t === 'consultant';
}
