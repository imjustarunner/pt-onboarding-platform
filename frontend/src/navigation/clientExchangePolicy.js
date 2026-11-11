// Shared by the exchange UI and API (this directory ships in the backend image).
export const exchangeStaffRole = role => ['staff', 'support', 'admin', 'super_admin'].includes(String(role || '').trim().toLowerCase());
export const exchangeRequestNeedsPlan = fit => (fit?.adjustments || []).some(reason => ['format_availability','office_location'].includes(reason.code));
export const exchangeRequestPlanValid = (fit, message) => !exchangeRequestNeedsPlan(fit) || (typeof message === 'string' && message.trim().length >= 20 && message.trim().length <= 2000);

const labels = {
  account: 'Active provider account', assigned: 'Current assignment', direct_referral: 'Direct referral recipient',
  accepting: 'Accepting new clients', format: 'Visit format', provider_gender: 'Therapist gender preference',
  age: 'Client age', clinical_exclusions: 'Clinical exclusions', diagnoses: 'Diagnosis coverage', concerns: 'Clinical concerns',
  service: 'Service type', insurance: 'Insurance acceptance', insurance_credential: 'Insurance credentials',
  insurance_exclusions: 'Insurance exclusions', schedule: 'Days and times', location: 'In-person location', office_location: 'Assigned office city',
  location_availability: 'Location availability', specialties: 'Specialties', ageGroups: 'Age preferences',
  populations: 'Populations', modalities: 'Therapy approaches', qualification: 'Provider license requirement'
};
export function exchangeCheckLabel(field) {
  if (field.endsWith('_exclusions') && !labels[field]) return `${exchangeCheckLabel(field.slice(0, -11))} exclusions`;
  return labels[field] || field.replace(/_/g, ' ');
}
export const exchangeCheckCanBeWaived = field => Boolean(labels[field] || ['specialties_exclusions', 'ageGroups_exclusions', 'populations_exclusions', 'modalities_exclusions'].includes(field))
  && !['account', 'assigned', 'direct_referral', 'insurance', 'insurance_credential', 'insurance_exclusions', 'qualification', 'location', 'office_location', 'provider_gender'].includes(field);

export function normalizeExchangeQualification(value) {
  if (value == null || value === '') return '';
  if (value === 'licensed') return 'licensed_or_provisional';
  if (!['independent','licensed_or_provisional'].includes(value)) throw Object.assign(new Error('Choose a valid provider license requirement.'), {status:400});
  return value;
}

export function exchangeFitScore(checks) {
  const weights={insurance:50,qualification:40,schedule:40,location_availability:35,format:30,provider_gender:25,age:25,service:20,diagnoses:20,concerns:20,specialties:15,ageGroups:15,populations:15,modalities:15,location:20,office_location:40};
  let earned=0,possible=0;
  for(const check of checks || []) {
    const weight=weights[check.field] || 0;
    if(!weight || check.applicable===false || check.informational)continue;
    possible+=weight;
    if(check.status==='pass')earned+=weight;
  }
  return { matchScore:possible?Math.round(100*earned/possible):null, verifiedWeight:earned, requestedWeight:possible };
}

// A high preference score never moves an ineligible provider ahead of an eligible one.
export function compareExchangeFit(a,b) {
  return Number(!!b.matched)-Number(!!a.matched) || Number(!!b.canRequest)-Number(!!a.canRequest)
    || (b.matchScore ?? -1)-(a.matchScore ?? -1) || String(a.name || '').localeCompare(String(b.name || ''));
}

export const exchangeParameterGroups = [
  {field:'eligibility',label:'Account eligibility',fields:['account','assigned','direct_referral'],advanced:true},
  {field:'accepting',label:'Accepting new clients',fields:['accepting']},
  {field:'insurance',label:'Insurance',fields:['insurance','insurance_credential','insurance_exclusions']},
  {field:'qualification',label:'Provider license requirement',fields:['qualification']},
  {field:'format',label:'Visit format',fields:['format']},
  {field:'location',label:'Location',fields:['location','office_location','location_availability']},
  {field:'schedule',label:'Days and times',fields:['schedule']},
  {field:'provider_gender',label:'Therapist gender preference',fields:['provider_gender']},
  {field:'age',label:'Client age',fields:['age','ageGroups','ageGroups_exclusions']},
  {field:'diagnoses',label:'Diagnosis',fields:['diagnoses']},
  {field:'concerns',label:'Clinical concerns and specialties',fields:['concerns','specialties','clinical_exclusions','specialties_exclusions']},
  {field:'populations',label:'Populations',fields:['populations','populations_exclusions']},
  {field:'modalities',label:'Therapy approaches',fields:['modalities','modalities_exclusions']},
  {field:'service',label:'Service type',fields:['service']}
];
export function groupedExchangeParameters(providers,showEligibility=false) {
  return exchangeParameterGroups.filter(group=>showEligibility || !group.advanced).map(group=>{
    const row={...group,pass:[],fail:[],unknown:[],unspecified:[]};
    for(const provider of providers || []) {
      const checks=(provider.checks || []).filter(c=>group.fields.includes(c.field));
      if(!checks.length)continue;
      const applicable=checks.filter(c=>c.applicable!==false);
      const status=applicable.some(c=>c.status==='fail')?'fail':!applicable.length?'unspecified':applicable.some(c=>c.status==='unknown')?'unknown':'pass';
      row[status].push({userId:provider.userId,name:provider.name,waived:checks.some(c=>c.waiver)});
    }
    return row;
  }).filter(row=>row.pass.length+row.fail.length+row.unknown.length+row.unspecified.length>0);
}

/** A viewer's request decision, not a guarantee of assignment or an agency-wide match. */
export function exchangePersonalFitSummary(fit){
 if(typeof fit?.canRequest!=='boolean')return {state:'unavailable',label:'Matching unavailable',reasons:['Open the listing to review current matching details.']};
 const state=!fit.canRequest?'blocked':fit.status==='match'?'matched':'eligible';
 const label=state==='blocked'?'Request blocked':state==='matched'?'Matched to you':'Not matched yet · Can request';
 const reasons=[...new Set([...(fit.blockers||[]),...(fit.adjustments||[]),...(fit.review||[])].map(reason=>String(reason.message||reason.reason||'').trim()).filter(Boolean))];
 return {state,label,reasons};
}
