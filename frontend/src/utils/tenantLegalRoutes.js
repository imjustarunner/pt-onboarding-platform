import { tenantLegalProfiles, tenantLegalLinks } from '../content/tenantLegalProfiles.js';
export function legalRouteEntries(profile) {
  return tenantLegalLinks(profile).flatMap(link=>[
    {path:link.path,type:link.type,canonical:link.path},
    {path:`/${link.type}`,type:link.type,canonical:link.path},
    {path:`/p/${profile.slug}/${link.type}`,type:link.type,canonical:link.path},
    ...({'privacypolicy':['privacy','privacy-policy'],'terms':[],'messaging':[],'platformhipaa':['hipaa']}[link.type]).flatMap(alias=>[
      {path:`/${alias}`,type:link.type,canonical:link.path},
      {path:`/p/${profile.slug}/${alias}`,type:link.type,canonical:link.path}
    ])
  ]);
}
export function tenantLegalRequest(host,path) {
  const domain=String(host||'').toLowerCase().split(':')[0].replace(/^www\./,'');
  // Explicit public sites only. App hosts retain the Vue router and tenant prefix.
  const profile=domain==='plottwisthq.com'?tenantLegalProfiles.ptco:Object.values(tenantLegalProfiles).find(p=>new URL(p.origin).hostname.replace(/^www\./,'')===domain);
  if(!profile)return null;
  const url=new URL(path,profile.origin);
  const entry=legalRouteEntries(profile).find(e=>e.path===url.pathname.replace(/\/$/,''));
  if(!entry)return null;
  return {profile,type:entry.type,canonical:(profile.legalOrigin||profile.origin)+entry.canonical,redirect:url.pathname!==entry.canonical?(profile.legalOrigin||profile.origin)+entry.canonical+url.search:null};
}
