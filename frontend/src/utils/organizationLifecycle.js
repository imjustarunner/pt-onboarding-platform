export function organizationLifecycle(org) {
  if(org?.is_archived===true || Number(org?.is_archived)===1)return 'archived';
  if(org?.lifecycle_state)return org.lifecycle_state;
  let flags=org?.feature_flags || {};
  if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
  if(String(org?.organization_type).toLowerCase()==='school' && (flags.schoolOnboardingDraft===true || flags.schoolLifecycleState==='onboarding'))return 'onboarding';
  return org?.is_active===true || Number(org?.is_active)===1?'active':'inactive';
}
export const organizationLifecycleLabel=org=>({onboarding:'Onboarding',active:'Active',inactive:'Inactive',archived:'Archived'}[organizationLifecycle(org)] || 'Inactive');
