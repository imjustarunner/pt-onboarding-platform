/** Company workspaces and affiliated organizations have different ownership scopes. */
export const ROOT_TENANT_TYPES = ['agency', 'clubwebapp', 'life_coach', 'consultant'];
export function isRootTenant(org) {
  const type=String(org?.organization_type || org?.organizationType || '').trim().toLowerCase();
  return ROOT_TENANT_TYPES.includes(type);
}
export function organizationKindLabel(org) {
  if(isRootTenant(org)) return 'Company workspace';
  return ({school:'Affiliated school',program:'Affiliated program',learning:'Affiliated learning organization',clinical:'Affiliated clinical organization',affiliation:'Affiliation',office:'Office location'})[String(org?.organization_type || org?.organizationType || '').toLowerCase()] || 'Organization — type unconfirmed';
}
