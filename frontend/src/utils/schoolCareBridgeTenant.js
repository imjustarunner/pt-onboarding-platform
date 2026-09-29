import { schoolCareBridgePath } from './schoolCareBridge';
export function isSchoolCareBridgeOnly(agency) {
  let flags=agency?.feature_flags||agency?.featureFlags||{};
  try{if(typeof flags==='string')flags=JSON.parse(flags);}catch{return false;}
  return flags?.schoolCareBridgeOnly===true;
}
export const schoolCareBridgePartnerPath = (slug,section='') => `${schoolCareBridgePath()}/partners/${encodeURIComponent(slug)}${section?'/'+section:''}`;
export function scopedSchoolCareBridgeDestination(to,agencies=[]) {
  if(to.path.startsWith('/schoolcarebridge')||to.meta?.publicMarketingHub||/login|password|account-security|session-ended|documents\//.test(to.path))return null;
  const agency=agencies.find(a=>(a.portal_url||a.slug)===to.params?.organizationSlug);
  const tenants=agencies.filter(a=>a.organization_type==='agency');
  const scoped=agency?isSchoolCareBridgeOnly(agency):tenants.length>0&&tenants.every(isSchoolCareBridgeOnly);
  if(!scoped)return null;
  const tenant=agency||tenants[0];
  // Existing school portals and signing views keep their own server authorization.
  if(agency?.organization_type==='school')return null;
  return schoolCareBridgePartnerPath(tenant.portal_url||tenant.slug);
}
