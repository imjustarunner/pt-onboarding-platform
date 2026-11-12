/** Prospective NLU terms. Never reinterpret a previously signed three-category schedule. */
import {programProbationApplies} from './programServiceRates.js';
export const NLU_COMPENSATION_POLICY_VERSION = 'nlu-four-category-2026-11-21';
export const NLU_COMPENSATION_CATEGORIES = Object.freeze({
  1: {label:'Foundational Provider',description:'No bachelor’s degree; approved nonclinical childcare, tutoring and educational activities only'},
  2: {label:'Bachelor’s-Level and Approved Unlicensed Provider',description:'Bachelor’s-level and other expressly approved unlicensed placement'},
  3: {label:'Master’s-Level and Pre-Licensed Provider',description:'Standard master’s-level placement; rare non-master’s exceptions require written approval'},
  4: {label:'Licensed and Advanced Provider',description:'Independently licensed and expressly approved advanced placement'}
});
export const NLU_PAY_LEVELS = Object.freeze([
  {level:1,label:'Entry Provider',description:'Beginning experience; follows established plans with appropriate guidance.'},
  {level:2,label:'Developing Provider',description:'Consistent basic skills, reliability and increasing independence within the assigned role.'},
  {level:3,label:'Experienced Provider',description:'Established competency, sound judgment and consistent delivery.'},
  {level:4,label:'Advanced Provider',description:'Substantial relevant experience, specialized skills, complex responsibilities or mentoring.'},
  {level:5,label:'Senior Provider',description:'Extensive relevant experience, sustained performance and leadership or advanced responsibilities.'}
]);
export const NLU_FOUNDATIONAL_RATES = Object.freeze([17,18,19,20,20]);
export const NLU_BACHELOR_CHILDCARE_RATES = Object.freeze([22,23,24,24,24]);
export const NLU_BACHELOR_TUTORING_VIRTUAL_RATES = Object.freeze([18,20,21,25,30]);
export const NLU_BACHELOR_TUTORING_IN_PERSON_RATES = Object.freeze([19,21,23,27,33]);
const childAdditions = [0,4,6,8];
const error = (message,code='NLU_COMPENSATION_REVIEW_REQUIRED') => Object.assign(new Error(message),{code,status:409});
const placement = (category,level) => {
  if (![1,2,3,4].includes(Number(category)) || ![1,2,3,4,5].includes(Number(level))) throw error('Confirm the approved NLU service category and pay level.');
};
export const isNluCompensationProfile = profile => profile?.nluCompensationPolicyVersion === NLU_COMPENSATION_POLICY_VERSION;

export function nluChildcareRate({category,level,children=1,caregivers=1,minimumHourlyRate=0,individualHourlyRate=null}) {
  placement(category,level);
  if (!Number.isSafeInteger(Number(children)) || Number(children)<0 || !Number.isSafeInteger(Number(caregivers)) || Number(caregivers)<1) throw error('Record actual child attendance and active assigned caregivers.');
  // Zero-child required preparation, cleanup and on-duty availability use the base rate.
  const band=Math.max(1,Math.ceil(Number(children)/Number(caregivers)));
  if (band>4) throw error('More than four children per caregiver requires immediate staffing review; do not extrapolate a pay band.','CHILDCARE_STAFFING_REVIEW_REQUIRED');
  const base=(Number(category)===1?NLU_FOUNDATIONAL_RATES:NLU_BACHELOR_CHILDCARE_RATES)[Number(level)-1];
  const agreed=individualHourlyRate==null?base+childAdditions[band-1]:Number(individualHourlyRate);
  if (!Number.isFinite(agreed)||agreed<=0||!Number.isFinite(Number(minimumHourlyRate))||Number(minimumHourlyRate)<0) throw error('Confirm the individual childcare rate and applicable wage floor.');
  return {rate:Math.max(agreed,Number(minimumHourlyRate)),baseRate:base,childrenPerCaregiver:band,autoIndirectMinutesPerHour:0};
}

export function nluTutoringRate({category,level,format='virtual',individualHourlyRate=null}) {
  placement(category,level);
  if (individualHourlyRate!=null) {
    if(!Number.isFinite(Number(individualHourlyRate))||Number(individualHourlyRate)<=0)throw error('Confirm the approved individual tutoring rate.');
    return Number(individualHourlyRate);
  }
  if(Number(category)>2)throw error('Categories 3 and 4 need a separately approved tutoring placement; childcare caps do not determine tutoring pay.');
  if(Number(category)===1)return NLU_FOUNDATIONAL_RATES[Number(level)-1];
  if(!['virtual','in_person','in-person'].includes(format))throw error('Choose the approved tutoring delivery format.');
  return (format==='virtual'?NLU_BACHELOR_TUTORING_VIRTUAL_RATES:NLU_BACHELOR_TUTORING_IN_PERSON_RATES)[Number(level)-1];
}

export function nluCompensationService(serviceCode) {
  const code=String(serviceCode||'').trim().toUpperCase().replace(/[_-]/g,' ');
  if(/^(?:CHILDCARE|CHILD CARE|DAYCARE)(?: |$)/.test(code))return 'childcare';
  if(/^(?:TESTING EVALUATION|PSYCHOLOGICAL TESTING EVALUATION|NEUROPSYCHOLOGICAL TESTING EVALUATION)(?: |$)/.test(code)||/^(96130|96131|96132|96133)$/.test(code))return 'testing_evaluation';
  if(/^(?:TESTING ADMINISTRATION|TESTING SCORING|PSYCHOLOGICAL TESTING ADMINISTRATION|CLINICAL TELEPHONE ASSESSMENT)(?: |$)/.test(code)||/^(96136|96137|96138|96139|98966|98967|98968)$/.test(code))return 'testing_administration';
  if(/^TUTORING(?: |$)/.test(code))return 'tutoring';
  if(/^HOMEWORK(?: HELP)?(?: |$)/.test(code))return 'homework_help';
  return null;
}

/** Actual minutes come from work records, never CPT initial/add-on billing units. */
export function computeNluServicePay({profile,status={},serviceCode,actualMinutes,serviceContext={}}) {
  if(!isNluCompensationProfile(profile))return null;
  placement(profile.category,profile.level);
  const service=nluCompensationService(serviceCode);
  const code=String(serviceCode||'').trim().toUpperCase();
  if(Number(profile.category)===1 && (service?.startsWith('testing')||code==='H2014'||/^H\d|^9\d/.test(code)||/PSYCHOTHERAPY|COUNSELING|CLINICAL ASSESSMENT/.test(code)))throw error('NLU Category 1 is limited to approved nonclinical childcare, tutoring and educational work; it does not authorize clinical services or testing.','NLU_CATEGORY_SERVICE_NOT_ALLOWED');
  if(!service)return null;
  const effectiveOn=profile.nluCompensationEffectiveOn || profile.agreementEffectiveOn;
  if(effectiveOn && (!status.asOfDate || String(status.asOfDate).slice(0,10)<String(effectiveOn).slice(0,10)))throw error('Review the actual service date and prior individual terms before applying the new NLU service schedule.');
  if(!Number.isFinite(Number(actualMinutes))||actualMinutes==null||Number(actualMinutes)<0)throw error('Record actual work minutes for this NLU service. Billing units cannot establish employee work time.','ACTUAL_WORK_TIME_REQUIRED');
  if(!Number.isFinite(Number(serviceContext.minimumHourlyRate))||Number(serviceContext.minimumHourlyRate)<=0||!String(serviceContext.wageFloorJurisdiction||'').trim())throw error('Confirm the applicable work-location wage floor and jurisdiction before calculating new NLU service pay. A statewide default cannot establish a local wage floor.','WAGE_FLOOR_REVIEW_REQUIRED');
  const hours=Number(actualMinutes)/60;
  const reduced=!!status.useReducedRates;
  const programProbation=Number(profile.category)>=3&&programProbationApplies(profile,status);
  let programProbationApplied=false;
  let rate,indirectMinutes=0;
  if(service==='childcare') {
    if(profile.childcareLevel==null)throw error('Record the separately approved childcare pay level.');
    if(serviceContext.children==null||serviceContext.caregivers==null)throw error('Record actual child attendance and active assigned caregivers.');
    rate=nluChildcareRate({category:profile.category,level:profile.childcareLevel,children:serviceContext.children,caregivers:serviceContext.caregivers,minimumHourlyRate:serviceContext.minimumHourlyRate,individualHourlyRate:profile.childcareRate}).rate;
  } else if(service==='tutoring') {
    if(profile.tutoringLevel==null)throw error('Record the separately approved tutoring pay level.');
    const rawFormat=serviceContext.format || (/IN PERSON/.test(code)?'in_person':/VIRTUAL/.test(code)?'virtual':null);
    const format=String(rawFormat||'').trim().toLowerCase().replace(/[ -]/g,'_');
    if(!['virtual','in_person'].includes(format))throw error('Record the actual tutoring delivery format before selecting its hourly rate.','TUTORING_FORMAT_REQUIRED');
    const override=profile.tutoringRates?.[format] ?? (format==='virtual'?profile.tutoringVirtualRate:profile.tutoringInPersonRate) ?? profile.tutoringHourlyRate ?? profile.tutoringRate;
    rate=nluTutoringRate({category:profile.tutoringCategory??profile.category,level:profile.tutoringLevel,format,individualHourlyRate:override});
    if(programProbation){
      const probationRate=Number(profile.tutoringRateProbation);
      if(profile.tutoringRateProbation==null||!Number.isFinite(probationRate)||probationRate<=0)throw error('Confirm the separately disclosed tutoring program probation rate.');
      rate=probationRate;programProbationApplied=true;
    }
    indirectMinutes=10;
  } else if(service==='homework_help') {
    // The user retains Homework Help as a distinct individually approved schedule.
    rate=Number(programProbation?profile.homeworkHelpRateProbation:profile.homeworkHelpRate);
    programProbationApplied=programProbation;
  } else {
    if(profile.testingAuthorized!==true)throw error('Testing work requires documented instrument, personnel, scope, supervision and payer review; category placement alone is not authorization.','TESTING_AUTHORIZATION_REQUIRED');
    rate=Number(service==='testing_evaluation'?(reduced?(profile.testingEvaluationRateProbation??profile.testingEvaluationRate??profile.creditRateProbation??profile.creditRate):(profile.testingEvaluationRate??profile.creditRate)):(reduced?(profile.testingAdministrationRateProbation??profile.hcodeRateProbation??profile.hcodeRate):(profile.testingAdministrationRate??profile.hcodeRate)));
    indirectMinutes=service==='testing_administration'?10:0;
  }
  if(!Number.isFinite(rate)||rate<=0)throw error('Confirm the applicable approved service-specific hourly rate.');
  const floor=Number(serviceContext.minimumHourlyRate??0);
  if(!Number.isFinite(floor)||floor<0)throw error('Confirm the applicable work-location wage floor.');
  rate=Math.max(rate,floor);
  let indirectRate=Number(reduced?(profile.indirectRateProbation??profile.indirectRate):profile.indirectRate);
  if(indirectMinutes && (!Number.isFinite(indirectRate)||indirectRate<=0))throw error('Confirm the applicable agreed indirect hourly rate.');
  if(indirectMinutes)indirectRate=Math.max(indirectRate,floor);
  if(indirectMinutes)indirectMinutes=Math.max(10,Number(profile.autoIndirectMinutesPerHour)||0);
  const automaticHours=hours*indirectMinutes/60;
  return {service,rate,hours,amount:hours*rate,autoIndirectHours:automaticHours,autoIndirectAmount:automaticHours*(indirectRate||0),indirectRate,minimumHourlyRate:floor,wageFloorJurisdiction:serviceContext.wageFloorJurisdiction,programProbationApplied};
}
