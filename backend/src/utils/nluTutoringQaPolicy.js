// Exact retained synthetic organizations, distinct from NLU's live agency6.
export function isNluTutoringQaAgency(agency) {
 let flags=agency?.feature_flags;
 if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{return false;}}
 return ((Number(agency?.id)===453 && agency?.slug==='nlu-qa-demo')
   || (Number(agency?.id)===454 && agency?.slug==='nlu-qa-learning'))
   && flags?.qaSandbox?.syntheticOnly===true && flags?.qaSandbox?.program==='tutoring';
}
export function allowNluQaTutor(agency,user) {
 return isNluTutoringQaAgency(agency) && Number(user?.is_demo)===1
   && Number.isSafeInteger(Number(user?.id)) && Number(user.id)>0
   && user.email?.toLowerCase()==='qa.nlu.tutor@example.com'
   && ['provider','provider_plus'].includes(user.role);
}

// The retained LPC is the owner-authorized mixed-service QA fixture. Keep the
// private-office exception above bound only to Finley.
export function allowNluQaProvider(agency,user) {
 if(allowNluQaTutor(agency,user))return true;
 let flags=agency?.feature_flags;
 if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{return false;}}
 return isNluTutoringQaAgency(agency) && flags?.qaSandbox?.mixedServicesEnabled===true
   && Number(user?.id)===1433 && Number(user?.is_demo)===1
   && user?.email?.toLowerCase()==='qa.provider.auricwell@example.com'
   && ['provider','provider_plus'].includes(user?.role);
}

// Configuration-only NLU QA records reuse the existing tenant mail domain.
// This is not permission to provision a mailbox or bypass sender verification.
export function nluTutoringQaMailDomain(agency) {
  let flags = agency?.feature_flags;
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { return null; } }
  return isNluTutoringQaAgency(agency) && Number(agency.is_active) === 1
    && Number(agency.is_archived || 0) === 0 && Number(flags?.qaSandbox?.sourceAgencyId) === 6
    ? 'nextleveluplcc.com' : null;
}

export function allowNluQaServiceProvider(agency, user, serviceType) {
  if (!allowNluQaProvider(agency, user)) return false;
  return serviceType === 'tutoring' || (serviceType === 'counseling' && Number(user.id) === 1433);
}
