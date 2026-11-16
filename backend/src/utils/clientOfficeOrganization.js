// An office chart may belong to its own root agency; this never grants access
// to another tenant or replaces school/program affiliation checks.
export function isOfficeRootOrganization({agencyId,organizationId,organizationType,clientType}) {
 return Number(agencyId)>0 && Number(agencyId)===Number(organizationId)
  && String(organizationType||'').toLowerCase()==='agency' && String(clientType||'').toLowerCase()==='clinical';
}

export function supportsAgencyOfficeClients(agency) {
 if(String(agency?.organization_type||agency?.organizationType||'').toLowerCase()!=='agency')return false;
 let flags=agency.feature_flags??agency.featureFlags??{};
 if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
 return String(flags?.portalVariant||'healthcare_provider').toLowerCase()!=='employee';
}
