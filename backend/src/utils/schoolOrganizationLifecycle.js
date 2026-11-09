const truthy=value=>value===true || value===1 || value==='1' || value==='true';
export function schoolOrganizationLifecycle(org) {
  if(truthy(org?.is_archived))return 'archived';
  let flags=org?.feature_flags || {};
  if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
  if(String(org?.organization_type).toLowerCase()==='school' && (truthy(flags.schoolOnboardingDraft) || flags.schoolLifecycleState==='onboarding'))return 'onboarding';
  return truthy(org?.is_active)?'active':'inactive';
}
