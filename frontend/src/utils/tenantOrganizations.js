/**
 * Tenant (root) organization types for supervision and similar scopes.
 */
export function isTenantOrganization(org) {
  const t = String(org?.organization_type || 'agency').toLowerCase();
  return t === 'agency' || t === 'clubwebapp' || t === 'life_coach' || t === 'consultant';
}
