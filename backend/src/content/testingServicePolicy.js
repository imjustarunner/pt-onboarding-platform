// Compensation policy, not a payer fee schedule or a grant of clinical scope.
// Source: October 2026 Colorado SBHS Manual, pp. 30-44, 49 and 51.
export const TESTING_SERVICE_POLICY_VERSION = 'medicaid-testing-2026-11-13';
export const TESTING_SERVICE_ROLE = 'psychological_testing';
const row = (code, name, bucket, minutes, minimum, maximum, extra = {}) => Object.freeze({
  code, name, bucket, nominalMinutes: minutes, minimumMinutes: minimum,
  maximumMinutes: extra.claimBasis==='encounter'?maximum:null,
  manualMaximumIncrementMinutes: extra.claimBasis==='encounter'?null:maximum,
  claimBasis: 'timed', requiredRole: null, ...extra
});
const testing = { requiredRole: TESTING_SERVICE_ROLE, medicaidOnly: true };
export const TESTING_SERVICE_CODES = Object.freeze([
  row('96116','Neurobehavioral status examination, initial hour','credit',60,31,60,{...testing,providerCategories:'Intern supervised by a licensed psychologist; eligible licensed doctoral provider, APN, RxN, PA or MD/DO',coverageReviewRequired:true}),
  row('96121','Additional neurobehavioral status examination','credit',60,31,60,{...testing,baseCode:'96116',providerCategories:'Intern supervised by a licensed psychologist; eligible licensed doctoral provider, APN, RxN, PA or MD/DO',coverageReviewRequired:true}),
  row('96130','Psychological evaluation: integration, interpretation, report and feedback','credit',60,31,null,testing),
  row('96131','Additional psychological evaluation','credit',60,31,60,{...testing,baseCode:'96130'}),
  row('96132','Neuropsychological evaluation: integration, interpretation, report and feedback','credit',60,31,60,testing),
  row('96133','Additional neuropsychological evaluation','credit',60,31,60,{...testing,baseCode:'96132'}),
  row('96136','Qualified-professional administration/scoring of two or more tests','hcode',30,16,30,testing),
  row('96137','Additional qualified-professional administration/scoring','hcode',30,16,30,{...testing,baseCode:'96136'}),
  row('96138','Technician administration/scoring of two or more tests','hcode',30,16,30,{...testing,component:'technician',coverageReviewRequired:true}),
  row('96139','Additional technician administration/scoring','hcode',30,16,30,{...testing,component:'technician',baseCode:'96138',coverageReviewRequired:true}),
  row('96146','Single automated instrument with automated result only','hcode',null,null,null,{...testing,claimBasis:'encounter',unattendedTimeExcluded:true,coverageReviewRequired:true}),
  row('98966','Eligible clinical telephone assessment/management','hcode',null,5,10,{claimBasis:'encounter'}),
  row('98967','Eligible clinical telephone assessment/management','hcode',null,11,20,{claimBasis:'encounter'}),
  row('98968','Eligible clinical telephone assessment/management','hcode',null,21,30,{claimBasis:'encounter'}),
  row('H0001','Substance-use assessment, not a general psychological test','hcode',null,null,null,{claimBasis:'encounter'}),
  row('H0004','Treatment-plan behavioral-health counseling','hcode',15,8,15)
]);
const definitions = new Map(TESTING_SERVICE_CODES.map(definition=>[definition.code,definition]));
export const testingServiceDefinition = code => definitions.get(String(code||'').trim().toUpperCase()) || null;
export const requiresTestingRole = code => testingServiceDefinition(code)?.requiredRole === TESTING_SERVICE_ROLE;
export const normalizeTestingRole = role => ['testing','psychological_testing'].includes(String(role||'').trim().toLowerCase());
export function canUseTestingRole(profile) {
  const roles = profile?.serviceRoles ?? profile?.contractServiceRoles;
  // Earlier executed testing schedules already carried explicit authorization.
  // New schedules must also retain their selected service role.
  return profile?.testingAuthorized===true && (!Array.isArray(roles)||roles.some(normalizeTestingRole))
    && (profile.testingServicePolicyVersion!==TESTING_SERVICE_POLICY_VERSION||Array.isArray(roles));
}
export function assertTestingRole(profile) {
  if (!canUseTestingRole(profile)) {
    throw Object.assign(new Error('An approved Testing service role and documented instrument, personnel, scope, supervision and payer review are required.'),{status:403,code:'TESTING_ROLE_REQUIRED'});
  }
}
/** New executed schedules opt in; historical executed terms are not reinterpreted. */
export function computeTestingServicePay({profile,status={},serviceCode,actualMinutes,serviceContext={}}) {
  if(profile?.testingServicePolicyVersion!==TESTING_SERVICE_POLICY_VERSION)return null;
  const definition=testingServiceDefinition(serviceCode);
  if(!definition||definition.code==='H0004')return null;
  if(profile.nluCompensationPolicyVersion&&Number(profile.category)===1)throw Object.assign(new Error('Foundational providers are limited to approved nonclinical services; compensation placement does not authorize Testing or clinical telephone work.'),{status:403});
  if(definition.requiredRole)assertTestingRole(profile);
  if(actualMinutes==null||!Number.isFinite(Number(actualMinutes))||Number(actualMinutes)<0)throw Object.assign(new Error('Record actual work minutes separately from testing/telephone claim units.'),{status:409,code:'TESTING_ACTUAL_MINUTES_REQUIRED'});
  const hours=Number(actualMinutes)/60,reduced=!!status.useReducedRates,evaluation=definition.bucket==='credit';
  const rate=Number(evaluation?(reduced?(profile.testingEvaluationRateProbation??profile.testingEvaluationRate??profile.creditRateProbation??profile.creditRate):(profile.testingEvaluationRate??profile.creditRate)):(reduced?(profile.testingAdministrationRateProbation??profile.hcodeRateProbation??profile.hcodeRate):(profile.testingAdministrationRate??profile.hcodeRate)));
  const floor=Number(serviceContext.minimumHourlyRate||0),indirectRate=Number(reduced?(profile.indirectRateProbation??profile.indirectRate):profile.indirectRate);
  if(profile.nluCompensationPolicyVersion&&(!(floor>0)||!String(serviceContext.wageFloorJurisdiction||'').trim()))throw Object.assign(new Error('Confirm the actual work-location wage floor and jurisdiction.'),{status:409});
  if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(floor)||floor<0||(!evaluation&&(!Number.isFinite(indirectRate)||indirectRate<=0)))throw Object.assign(new Error('Confirm the approved testing/telephone pay and indirect rates.'),{status:409});
  const indirectMinutes=evaluation?0:Math.max(10,Number(profile.autoIndirectMinutesPerHour??profile.autoIndirectMinutes)||0);
  const autoIndirectHours=hours*indirectMinutes/60;
  return {definition,rate:Math.max(rate,floor),hours,amount:hours*Math.max(rate,floor),indirectRate:Math.max(indirectRate||0,floor),autoIndirectHours,autoIndirectAmount:autoIndirectHours*Math.max(indirectRate||0,floor),minimumHourlyRate:floor,wageFloorJurisdiction:String(serviceContext.wageFloorJurisdiction||'')};
}
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function testingCompensationBasis(definition) {
  if(definition.code==='H0004')return '0.25 Direct Care hour per verified 15-minute unit';
  const measure=definition.bucket==='credit'?'Clinical Session credits':'Direct Care hours';
  const nominal=definition.nominalMinutes?`; ${definition.nominalMinutes/60} ${definition.bucket==='credit'?'credit':'hour'} at ${definition.nominalMinutes} actual minutes`:'';
  return `Actual eligible component minutes ÷ 60 = ${measure}${nominal}`;
}
/** Staff-only planning calculation. Reimbursement is revenue, never a wage rate. */
export function testingMargin({code,actualMinutes,profile,reimbursement,supervisionCost=0,materialsCost=0}) {
  const definition=testingServiceDefinition(code);
  const values=[actualMinutes,reimbursement,supervisionCost,materialsCost].map(Number);
  if(!definition||values.some(value=>!Number.isFinite(value)||value<0))throw new Error('Provide a listed service, actual work time and nonnegative comparison amounts.');
  const hours=values[0]/60;
  const rate=Number(definition.bucket==='credit'?profile.creditRate:profile.hcodeRate);
  const indirectRate=Number(profile.indirectRate);
  if(!(rate>0)||!Number.isFinite(indirectRate)||indirectRate<0)throw new Error('Confirm the employee’s approved rates before estimating margin.');
  const indirectHours=definition.bucket==='hcode'?hours*Math.max(10,Number(profile.autoIndirectMinutesPerHour)||0)/60:0;
  const wages=hours*rate,indirectWages=indirectHours*indirectRate;
  const remaining=values[1]-wages-indirectWages-values[2]-values[3];
  return {code:definition.code,payBucket:definition.bucket,actualMinutes:values[0],comparisonRevenue:values[1],wages,indirectWages,supervisionCost:values[2],materialsCost:values[3],remainingBeforeOtherOverhead:remaining,nonpositive:remaining<=0,breakEvenMinutes:60*Math.max(0,values[1]-values[2]-values[3])/(rate+(definition.bucket==='hcode'?indirectRate*Math.max(10,Number(profile.autoIndirectMinutesPerHour)||0)/60:0))};
}
export function testingCodeReferenceHtml() {
  const rows=TESTING_SERVICE_CODES.map(definition=>{
    const duration=definition.nominalMinutes?`${definition.nominalMinutes}-minute increment; minimum ${definition.minimumMinutes} minutes${definition.baseCode?` beyond ${definition.baseCode}`:''}`:definition.minimumMinutes?`${definition.minimumMinutes}–${definition.maximumMinutes} minutes; one encounter`:'One encounter; document actual work minutes';
    return `<tr><th>${definition.code}</th><td>${escape(definition.name)}</td><td>${definition.bucket==='credit'?'Clinical Session Rate':'Direct Care Rate'}</td><td>${escape(testingCompensationBasis(definition))}</td><td>${escape(duration)}</td><td>${definition.requiredRole?'Approved Testing role; Medicaid only; instrument-specific qualifications and supervision':'Existing clinical service approval; not a Testing-only role'}${definition.providerCategories?'; '+escape(definition.providerCategories):''}${definition.coverageReviewRequired?'; separately verify the exact payer/provider pathway':''}</td></tr>`;
  }).join('');
  return `<h3>Testing and related clinical codes: compensation reference</h3><p>Policy ${TESTING_SERVICE_POLICY_VERSION}. These services count as direct clinical work for compensation even when eligible interpretation or report preparation occurs without the member present. Clinical Session Rate and Direct Care Rate are existing pay buckets, not permission to change a claim code. Testing uses this policy only for Medicaid clients; verify current coverage, rendering qualifications, supervision and authorization separately.</p><table><thead><tr><th>Code</th><th>Work</th><th>Pay bucket</th><th>Credits / paid time</th><th>Claim timing</th><th>Eligibility</th></tr></thead><tbody>${rows}</tbody></table><p>Base/add-on families: 96116 + 96121, 96130 + 96131, 96132 + 96133, 96136 + 96137, and technician 96138 + 96139. Do not use an add-on by itself or restart a base to manufacture units. Hour-based midpoint illustrations are 31–90 cumulative minutes for a base and 91–150 for base plus one add-on; half-hour families commonly use 16–45 and 46–75. Apply the actual current payer rules; the manual's increment is not an instruction to start an add-on at minute 31 or 61. Record and pay actual elapsed work separately from claim thresholds.</p><p>Administration/scoring and eligible clinical telephone work use the agreed Direct Care hourly rate plus the applicable 10-minute indirect allowance per direct hour, prorated, preserving greater agreed allowances. Professional evaluation uses the approved Clinical Session Rate per actual hour-equivalent, without a second automatic indirect cash allowance. Evaluation interpretation/report/feedback is part of that clinical component, not an additional indirect claim for the same minutes. Routine scheduling, authorization administration, training and unrelated preparation use the separately approved indirect/support assignment. Record additional compensable work once, including any time beyond an included allowance.</p><p>Telephone codes require an established member/parent/guardian, an eligible clinical discussion and the applicable prior-seven-day and next-24-hour/soonest-appointment exclusions. Routine reminder, scheduling or billing calls are indirect; feedback already included in an evaluation cannot also be a telephone claim. H0001 is a substance-use assessment; H0004 is counseling. Neither is a substitute psychological-testing code. Automated 96146 does not turn unattended computer time into employee work; do not use it for professional/technician administration or two or more tests.</p><p><a href="https://hcpf.colorado.gov/sbhs-billing-manual">October 2026 Colorado SBHS Billing Manual, pages 30–44, 49 and 51</a>. The dated CCHA list supplied for this review is a historical comparison, not a current payer-rate configuration. Follow the verified current benefit, payer and modifier instructions.</p>`;
}
export function testingCompensationSchedule(profile) {
  const money=value=>Number.isFinite(Number(value))&&Number(value)>0?`$${Number(value).toFixed(2)}`:null;
  const evaluation=money(profile.testingEvaluationRate??profile.creditRate),administration=money(profile.testingAdministrationRate??profile.hcodeRate),indirect=money(profile.indirectRate);
  if(!evaluation||!administration||!indirect)throw Object.assign(new Error('Confirm the approved Clinical Session, Direct Care and indirect rates before generating Testing terms.'),{status:400});
  const reducedEvaluation=money(profile.testingEvaluationRateProbation??profile.testingEvaluationRate??profile.creditRateProbation??profile.creditRate);
  const reducedAdministration=money(profile.testingAdministrationRateProbation??profile.hcodeRateProbation??profile.hcodeRate);
  const reduced=`Applicable introductory/workload rates, only where the signed schedule expressly requires them: administration ${reducedAdministration}/hour; evaluation ${reducedEvaluation}/hour. Preserve existing waivers; a role update does not restart probation.`;
  return `Medicaid-only Testing policy ${TESTING_SERVICE_POLICY_VERSION}. Authorized administration/scoring: ${administration}/actual hour at the existing Direct Care Rate, plus 10 paid indirect minutes per direct hour at ${indirect}/hour, prorated; preserve any greater agreed allowance. Separately authorized evaluation/interpretation/report/feedback: ${evaluation}/actual hour-equivalent at the existing Clinical Session Rate, with no second automatic indirect cash allowance. Neurobehavioral examination requires its separately approved qualification pathway. ${reduced} One hour of eligible evaluation equals 1.00 clinical credit; 30 minutes of administration equals 0.50 Direct Care hour. Actual minutes, claim units and compensation credits are recorded separately. Routine administration uses the agreed indirect rate; no duplicate minutes. Other clinical services retain their own service approval. Refer to the Workplace Handbook Testing area for procedure-code mappings, billing time rules, instrument examples and service-specific qualifications. This individual agreement states the assigned duties, rates and payment basis; later handbook edits do not silently change agreed rates or earned pay. Actual authorized work remains payable if a claim is denied. No existing signed terms or earned pay are changed.`;
}
