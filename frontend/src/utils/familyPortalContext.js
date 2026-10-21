const slugOf = org => String(org?.portal_url || org?.slug || org?.portalUrl || '').trim().toLowerCase();
const typeOf = org => String(org?.organization_type || org?.organizationType || '').toLowerCase();

// URL context can select an existing membership, never grant a new one.
export function resolveFamilyPortalOrganization(organizations, requestedSlug) {
  const list = Array.isArray(organizations) ? organizations : [];
  const requested = String(requestedSlug || '').trim().toLowerCase();
  const match = requested ? list.find(org => slugOf(org) === requested) : null;
  if (match && ['agency', 'learning', 'life_coach', 'consultant', ''].includes(typeOf(match))) return match;
  return null;
}

export function familyPortalDashboardPath(organization) {
  const slug = slugOf(organization);
  if (!slug) return null;
  const panel = ['life_coach', 'consultant'].includes(typeOf(organization)) ? 'client-dashboard' : 'guardian';
  return `/${encodeURIComponent(slug)}/${panel}?portal=${encodeURIComponent(slug)}`;
}

export function familyPortalClients(clients, organization) {
  const list = Array.isArray(clients) ? clients : [];
  const id = Number(organization?.id || 0);
  if (!id) return list;
  const childOrganization = ['school', 'program', 'learning', 'clinical'].includes(typeOf(organization));
  return list.flatMap(client=>{
    const context=client.care_contexts?.find(c=>Number(c.agency_id)===id);
    if(context)return [{...client,...context,organization_type:client.organization_type,services:context.services||[]}];
    return (childOrganization?Number(client.organization_id)===id:Number(client.agency_id)===id)?[client]:[];
  });
}

export function familyCareAgencies(profiles){
 const agencies=new Map();
 for(const profile of profiles||[])for(const c of profile.care_contexts?.length?profile.care_contexts:[profile]){
  const id=Number(c.agency_id);if(id)agencies.set(id,{id,name:c.agency_name,slug:c.agency_slug,logo_url:c.agency_logo_url,organization_type:c.organization_type==='learning'?'learning':'agency'});
 }
 return [...agencies.values()];
}

// The AuricWell /app entry currently serves the administrator preview. Family
// accounts use the same authorized portal for setup and subsequent sign-ins.
export function auricWellAccountDestination({hostname,role,organizations,requestedSlug,redirectPath}) {
  if (!/^(www\.)?auricwell\.com$/i.test(hostname || '')) return null;
  const normalizedRole=String(role || '').toLowerCase();
  const redirect=typeof redirectPath==='string' && redirectPath.startsWith('/') && !redirectPath.startsWith('//') && !redirectPath.includes('\\') ? redirectPath : null;
  if (normalizedRole==='super_admin') return {path:redirect || '/app',hardNavigate:true,organization:null};
  if (!['client_guardian','client'].includes(normalizedRole)) return null;
  const organization=resolveFamilyPortalOrganization(organizations,requestedSlug)
    || (Array.isArray(organizations)?organizations:[]).find(org=>resolveFamilyPortalOrganization([org],slugOf(org)));
  const familyRedirect=redirect && !/^\/app(?:\/|\?|$)/.test(redirect) ? redirect : null;
  return {path:familyRedirect || familyPortalDashboardPath(organization) || '/guardian',hardNavigate:false,organization:organization || null};
}
