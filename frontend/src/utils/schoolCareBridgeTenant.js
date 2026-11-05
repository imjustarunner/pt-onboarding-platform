import { schoolCareBridgePath } from './schoolCareBridge';
export function isSchoolCareBridgeOnly(agency) {
  let flags=agency?.feature_flags||agency?.featureFlags||{};
  try{if(typeof flags==='string')flags=JSON.parse(flags);}catch{return false;}
  return flags?.schoolCareBridgeOnly===true;
}
export const schoolCareBridgePartnerPath = (slug,section='') => `${schoolCareBridgePath()}/partners/${encodeURIComponent(slug)}${section?'/'+section:''}`;
export function scopedSchoolCareBridgeDestination(to,agencies=[],activeAgency=null) {
  if(to.path.startsWith('/schoolcarebridge')||to.meta?.publicMarketingHub||/login|password|account-security|session-ended|documents\//.test(to.path))return null;
  const agency=agencies.find(a=>(a.portal_url||a.slug)===to.params?.organizationSlug);
  if(agency?.organization_type==='school')return null;
  if(agency&&!isSchoolCareBridgeOnly(agency))return null;
  const tenants=agencies.filter(a=>a.organization_type==='agency');
  const activeLimited=!!activeAgency&&isSchoolCareBridgeOnly(activeAgency);
  const routeLimited=!!agency&&isSchoolCareBridgeOnly(agency);
  const onlyLimited=!activeAgency&&tenants.length>0&&tenants.every(isSchoolCareBridgeOnly);
  if(!activeLimited&&!routeLimited&&!onlyLimited)return null;
  const tenant=(activeLimited?activeAgency:null)||(routeLimited?agency:null)||tenants.find(isSchoolCareBridgeOnly);
  return tenant?schoolCareBridgePartnerPath(tenant.portal_url||tenant.slug):null;
}
